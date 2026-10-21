import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { QRCodeComponent } from 'angularx-qrcode';
import { StateStore } from '../../../Store/state.store';
import { AuthService } from '../../../Core/Services/auth-service';
import { SubscriptionModal } from '../subscription-modal/subscription-modal';
import { environment } from '../../../../environments/environment';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';

export type NotificationChannel = 'telegram' | 'email';
/** Alerts need an account and a CV before a channel can be connected; the modal walks through all three. */
export type AlertsSetupStep = 'account' | 'cv' | 'channel';

const TELEGRAM_POLL_MS = 3000;
const TELEGRAM_POLL_LIMIT_MS = 5 * 60 * 1000; // The bot link token is only useful for a few minutes
const RESEND_COOLDOWN_S = 60;
const CV_MAX_SIZE_MB = 10;
const CV_EXTENSIONS = ['pdf', 'doc', 'docx'];

/**
 * Opens the alerts setup: sign in, upload a CV and connect Telegram / Email, skipping the steps
 * already done. Shared by every page that offers "turn on alerts" or "connect".
 */
export function openNotificationChannelsModal(dialog: MatDialog, channel?: NotificationChannel) {
  return dialog.open(NotificationChannelsModal, {
    width: '480px',
    maxWidth: '95vw',
    panelClass: 'channels-dialog',
    autoFocus: false,
    // Signing in from the account step goes to /profile; the remaining steps continue there.
    closeOnNavigation: false,
    data: { channel },
  });
}

const STEPS: { key: AlertsSetupStep; label: string }[] = [
  { key: 'account', label: 'ანგარიში' },
  { key: 'cv', label: 'CV' },
  { key: 'channel', label: 'შეტყობინებები' },
];

@Component({
  selector: 'app-notification-channels-modal',
  standalone: true,
  imports: [MatDialogModule, FormsModule, QRCodeComponent],
  templateUrl: './notification-channels-modal.html',
  styleUrl: './notification-channels-modal.scss',
})
export class NotificationChannelsModal implements OnDestroy {
  private dialogRef = inject(MatDialogRef<NotificationChannelsModal>);
  private data = inject<{ channel?: NotificationChannel }>(MAT_DIALOG_DATA, { optional: true });
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private authService = inject(AuthService);
  stateStore = inject(StateStore);

  profile = this.stateStore.profile;
  isPro = this.stateStore.isPro;
  telegramConnected = computed(() => !!this.profile().telegramChatId);
  emailVerified = computed(() => !!this.profile().isEmailVerified);
  // Phones open the bot directly; a QR code only helps on a desktop screen.
  isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  tab = signal<NotificationChannel>(
    this.data?.channel ?? (this.isPro() && !this.profile().telegramChatId ? 'email' : 'telegram'),
  );

  // Setup steps
  readonly steps = STEPS;
  isLoggedIn = this.authService.isLoggedIn;
  // Until the CV request answers we can't tell whether the CV step is needed.
  checkingCv = computed(() => this.isLoggedIn() && !this.stateStore.cvLoaded());
  step = computed<AlertsSetupStep>(() => {
    if (!this.isLoggedIn()) return 'account';
    if (!this.stateStore.userCv()) return 'cv';
    return 'channel';
  });
  /** Done by actual state, not position: Telegram can be connected before a CV is uploaded. */
  isStepDone(key: AlertsSetupStep): boolean {
    if (key === 'account') return this.isLoggedIn();
    if (key === 'cv') return !!this.stateStore.userCv();
    return this.stateStore.hasChannelStep();
  }

  // Account step
  authMode = signal<'login' | 'register'>('login');
  firstName = signal('');
  lastName = signal('');
  email = signal('');
  password = signal('');
  accountLoading = signal(false);
  accountError = signal('');

  // CV step
  cvConsent = signal(false);
  cvError = signal('');
  cvUploading = this.stateStore.cvLoading;

  // Telegram
  telegramLink = signal('');
  telegramLoading = signal(false);
  telegramError = signal('');
  telegramWaiting = signal(false);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollStartedAt = 0;

  // Email
  code = signal('');
  codeSent = signal(false);
  emailLoading = signal(false);
  emailError = signal('');
  emailSuccess = signal('');
  resendCooldown = signal(0);
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (this.isLoggedIn()) this.stateStore.ensureDataLoaded();

    // Prepare the bot link as soon as the Telegram tab is visible and not yet connected.
    effect(() => {
      if (this.step() === 'channel' && this.tab() === 'telegram' && !this.telegramConnected() && !this.telegramLink()) {
        void this.createTelegramLink();
      }
    });
  }

  // ── Account ─────────────────────────────────────────────────

  setAuthMode(mode: 'login' | 'register') {
    this.authMode.set(mode);
    this.accountError.set('');
  }

  canSubmitAccount = computed(() => {
    const filled = !!this.email().trim() && !!this.password();
    return this.authMode() === 'login' ? filled : filled && !!this.firstName().trim() && !!this.lastName().trim();
  });

  /** Registering signs the user in right away, so the setup continues without a second form. */
  async submitAccount() {
    if (!this.canSubmitAccount() || this.accountLoading()) return;
    this.accountLoading.set(true);
    this.accountError.set('');
    const email = this.email().trim();
    try {
      if (this.authMode() === 'register') {
        await firstValueFrom(
          this.authService.userRegistration({
            firstName: this.firstName().trim(),
            lastName: this.lastName().trim(),
            email,
            password: this.password(),
          }),
        );
      }
      await firstValueFrom(this.authService.login(email, this.password()));
      await this.stateStore.loadProfile(true);
      // Also attaches a CV uploaded before signing in, which skips the CV step.
      await this.stateStore.getCv(true);
    } catch (err: any) {
      this.accountError.set(this.errorText(err, this.authMode() === 'login'
        ? 'შესვლა ვერ მოხერხდა. შეამოწმეთ ელ-ფოსტა და პაროლი.'
        : 'რეგისტრაცია ვერ მოხერხდა. სცადეთ თავიდან.'));
      return;
    } finally {
      this.accountLoading.set(false);
    }

    // Same landing as the header sign-in. An account that is already set up has nothing left to do
    // here; otherwise the modal stays open on its next step (it survives navigation).
    if (this.stateStore.alertsReady()) this.dialogRef.close();
    await this.router.navigateByUrl('/profile');
  }

  // Leaves the page; after the redirect back, App reopens the setup at its next step.
  signInWithGoogle() {
    window.location.href = `${environment.apiUrl}/auth/google/login`;
  }

  private errorText(err: any, fallback: string): string {
    const message = err?.error?.message;
    if (Array.isArray(message)) return message.join(', ');
    return typeof message === 'string' && message ? message : fallback;
  }

  // ── CV ──────────────────────────────────────────────────────

  async onCvSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.cvUploading()) return;

    this.cvError.set('');
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!CV_EXTENSIONS.includes(ext)) {
      this.cvError.set('ატვირთეთ PDF ან Word ფაილი');
      return;
    }
    if (file.size > CV_MAX_SIZE_MB * 1024 * 1024) {
      this.cvError.set(`ფაილის ზომა არ უნდა აღემატებოდეს ${CV_MAX_SIZE_MB}MB-ს`);
      return;
    }

    if (!(await this.stateStore.uploadCv(file, true))) {
      this.cvError.set('CV-ს ატვირთვა ვერ მოხერხდა. სცადეთ თავიდან.');
    }
  }

  ngOnDestroy() {
    this.stopPolling();
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
  }

  selectTab(tab: NotificationChannel) {
    this.tab.set(tab);
  }

  // ── Telegram ────────────────────────────────────────────────

  async createTelegramLink() {
    if (this.telegramLoading()) return;
    this.telegramLoading.set(true);
    this.telegramError.set('');
    try {
      const token = await this.authService.generateTelegramToken();
      this.telegramLink.set(`${environment.telegramUrl}?start=${token}`);
      this.startPolling();
    } catch {
      this.telegramError.set('ბმულის შექმნა ვერ მოხერხდა. სცადეთ თავიდან.');
    } finally {
      this.telegramLoading.set(false);
    }
  }

  openTelegram() {
    window.open(this.telegramLink(), '_blank', 'noopener');
    this.startPolling();
  }

  // The bot links the account server-side; we just watch the profile until the chat id appears.
  private startPolling() {
    this.telegramWaiting.set(true);
    this.pollStartedAt = Date.now();
    if (this.pollTimer) return;
    this.pollTimer = setInterval(async () => {
      if (Date.now() - this.pollStartedAt > TELEGRAM_POLL_LIMIT_MS) {
        this.stopPolling();
        return;
      }
      await this.stateStore.loadProfile(true, true);
      if (this.telegramConnected()) {
        this.stopPolling();
        this.enableAlerts();
      }
    }, TELEGRAM_POLL_MS);
  }

  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.telegramWaiting.set(false);
  }

  // ── Email ───────────────────────────────────────────────────

  async sendCode() {
    if (this.resendCooldown() > 0 || this.emailLoading()) return;
    this.emailLoading.set(true);
    this.emailError.set('');
    this.emailSuccess.set('');
    try {
      await this.authService.resendVerification(this.profile().email);
      this.emailSuccess.set(this.codeSent() ? 'კოდი ხელახლა გაიგზავნა' : 'კოდი გაიგზავნა თქვენს ელ-ფოსტაზე');
      this.codeSent.set(true);
      this.startCooldown();
    } catch (err: any) {
      this.emailError.set(err?.error?.message || 'კოდის გაგზავნა ვერ მოხერხდა. სცადეთ მოგვიანებით.');
    } finally {
      this.emailLoading.set(false);
    }
  }

  async verifyCode() {
    const code = this.code().trim();
    if (!this.codeSent() || code.length !== 6 || this.emailLoading()) return;
    this.emailLoading.set(true);
    this.emailError.set('');
    this.emailSuccess.set('');
    try {
      await this.authService.verifyEmail(this.profile().email, code);
      await this.stateStore.loadProfile(true, true);
      this.enableAlerts();
    } catch (err: any) {
      this.emailError.set(err?.error?.message || 'დადასტურება ვერ მოხერხდა. შეამოწმეთ კოდი.');
    } finally {
      this.emailLoading.set(false);
    }
  }

  // Alerts go to Telegram when a chat id exists, otherwise to email.
  useEmailInstead() {
    this.stateStore.updateProfile(this.profile().id, { telegramChatId: '' });
    this.telegramLink.set('');
  }

  private startCooldown() {
    this.resendCooldown.set(RESEND_COOLDOWN_S);
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(() => {
      const next = this.resendCooldown() - 1;
      this.resendCooldown.set(Math.max(next, 0));
      if (next <= 0 && this.cooldownTimer) {
        clearInterval(this.cooldownTimer);
        this.cooldownTimer = null;
      }
    }, 1000);
  }

  // ── Shared ──────────────────────────────────────────────────

  private enableAlerts() {
    if (!this.profile().receiveMessages) {
      this.stateStore.updateProfile(this.profile().id, { receiveMessages: true });
    }
  }

  openUpgrade() {
    this.dialogRef.close();
    this.dialog.open(SubscriptionModal, {
      width: '960px',
      maxWidth: '96vw',
      panelClass: 'subscription-dialog',
      autoFocus: false,
    });
  }

  close() {
    this.dialogRef.close();
  }
}

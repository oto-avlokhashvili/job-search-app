import { Component, effect, inject, signal, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StateStore } from '../../../Store/state.store';
import { AuthService } from '../../../Core/Services/auth-service';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionModal } from '../private-layout/subscription-modal/subscription-modal';
import { QrModal } from '../qr-modal/qr-modal';
import { EmailVerifyModal } from '../dashboard/email-verify-modal/email-verify-modal';
import { Onboarding } from '../onboarding/onboarding';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  validators = signal(false);
  fb = inject(FormBuilder);
  stateStore = inject(StateStore);
  authService = inject(AuthService);
  private alertify = inject(AlertifyService);
  dialog = inject(MatDialog);
  keywordInputValue = signal<string>('');

  hasNameStep = computed(() => {
    const p = this.stateStore.profile();
    return !!p?.firstName?.trim() && p?.firstName !== '---' && !!p?.lastName?.trim() && p?.lastName !== '---';
  });
  hasCvStep = computed(() => this.stateStore.hasCvStep());
  hasKeywordsStep = computed(() => (this.stateStore.searchQuery()?.length || 0) > 0);
  hasNotificationStep = computed(() => this.stateStore.hasNotificationStep());
  hasSubscriptionStep = computed(() => this.stateStore.hasSubscriptionStep());

  completedStepsCount = computed(() => {
    return [
      this.hasNameStep(),
      this.hasCvStep(),
      this.hasKeywordsStep(),
      this.hasNotificationStep(),
      this.hasSubscriptionStep(),
    ].filter(Boolean).length;
  });

  completedPercentage = computed(() => Math.round((this.completedStepsCount() / 5) * 100));

  openAccordions = signal<Record<string, boolean>>({
    info: false,
    keywords: true,
    notifications: false,
    cv: false,
    subscription: false,
  });

  toggleAccordion(section: string) {
    this.openAccordions.update((state) => ({
      ...state,
      [section]: !state[section],
    }));
  }

  isAccordionOpen(section: string): boolean {
    return !!this.openAccordions()[section];
  }

  initials = computed(() => {
    const u = this.stateStore.profile();
    if (!u) return '';
    return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
  });

  isWordFile = computed(() => {
    const name = this.stateStore.userCv()?.originalName || '';
    return name.toLowerCase().endsWith('.doc') || name.toLowerCase().endsWith('.docx');
  });

  cvTextSummary = computed(() => {
    const cv = this.stateStore.userCv();
    if (!cv) return '';
    if (typeof cv.summary === 'string') return cv.summary;
    const s = cv.summary;
    if (s && typeof s === 'object') {
      return (
        s.summary ||
        s.overview ||
        s.candidateSummary ||
        s.description ||
        s.text ||
        s.candidateProfile?.summary ||
        ''
      );
    }
    return cv.cvSummary || cv.overview || cv.description || '';
  });

  profileForm = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: [{ value: '', disabled: true }],
    subscription: [''],
    searchQuery: [[] as string[]],
    telegramChatId: [''],
    receiveMessages: [false],
  });

  constructor() {
    effect(() => {
      const profile = this.stateStore.profile();
      const loaded = this.stateStore.profileLoaded();

      if (loaded && profile) {
        this.profileForm.patchValue({
          firstName: profile.firstName || '',

          lastName: profile.lastName || '',
          email: profile.email || '',
          subscription: profile.subscription || '',
          telegramChatId: profile.telegramChatId || '',
          searchQuery: profile.searchQuery || [],
          receiveMessages: profile.receiveMessages ?? false,
        });
      }
    });
  }

  isInvalid(name: string) {
    const control = this.profileForm.get(name);
    return !!(control && control.invalid && (control.touched || this.validators()));
  }

  popularKeywords = signal<string[]>([
    'Frontend Developer',
    'Backend Developer',
    'Full Stack',
    'Angular',
    'React',
    'Node.js',
    'Python',
    'UI/UX Designer',
    'DevOps',
  ]);

  keywordsLoading = signal<boolean>(false);
  addingKeyword = signal<string | null>(null);
  removingKeywordIndex = signal<number | null>(null);

  async addSuggestedKeyword(keyword: string) {
    if (this.keywordsLoading()) return;
    const currentKeywords = this.stateStore.searchQuery() || [];
    if (!currentKeywords.includes(keyword)) {
      this.addingKeyword.set(keyword);
      this.keywordsLoading.set(true);
      try {
        await this.stateStore.updateSearchQueries([...currentKeywords, keyword]);
        this.alertify.success(`დაემატა: ${keyword}`);
      } catch (err) {
        this.alertify.error('საკვანძო სიტყვის დამატება ვერ მოხერხდა');
      } finally {
        this.addingKeyword.set(null);
        this.keywordsLoading.set(false);
      }
    }
  }

  async addKeywordFromValue() {
    if (this.keywordsLoading()) return;
    const value = this.keywordInputValue().trim();
    if (value) {
      const currentKeywords = this.stateStore.searchQuery() || [];
      if (!currentKeywords.includes(value)) {
        this.addingKeyword.set(value);
        this.keywordsLoading.set(true);
        try {
          await this.stateStore.updateSearchQueries([...currentKeywords, value]);
          this.keywordInputValue.set('');
        } catch (err) {
          this.alertify.error('საკვანძო სიტყვის დამატება ვერ მოხერხდა');
        } finally {
          this.addingKeyword.set(null);
          this.keywordsLoading.set(false);
        }
      } else {
        this.keywordInputValue.set('');
      }
    }
  }

  async removeKeyword(index: number) {
    if (this.keywordsLoading()) return;
    const currentKeywords = this.stateStore.searchQuery() || [];
    const updatedKeywords = currentKeywords.filter((_, i) => i !== index);
    this.removingKeywordIndex.set(index);
    this.keywordsLoading.set(true);
    try {
      await this.stateStore.updateSearchQueries(updatedKeywords);
    } catch (err) {
      this.alertify.error('საკვანძო სიტყვის წაშლა ვერ მოხერხდა');
    } finally {
      this.removingKeywordIndex.set(null);
      this.keywordsLoading.set(false);
    }
  }

  save() {
    this.validators.set(true);
    if (this.profileForm.valid) {
      const val = this.profileForm.getRawValue();
      const payload = {
        firstName: val.firstName,
        lastName: val.lastName,
        receiveMessages: val.receiveMessages,
      };
      this.stateStore.updateProfile(this.stateStore.profile()?.id, payload);
      this.alertify.success('პროფილის მონაცემები წარმატებით განახლდა');
    } else {
      this.alertify.error('გთხოვთ შეავსოთ სავალდებულო ველები');
    }
  }

  toggleReceiveMessages(event: any) {
    const checked = event.target.checked;
    this.profileForm.patchValue({ receiveMessages: checked });
    this.stateStore.updateProfile(this.stateStore.profile()?.id, { receiveMessages: checked });
    this.alertify.success(checked ? 'შეტყობინებების მიღება გააქტიურდა' : 'შეტყობინებების მიღება გამორთულია');
  }

  openUpgradeModal() {
    this.dialog.open(SubscriptionModal, {
      width: '560px',
      maxWidth: '95vw',
      panelClass: 'subscription-dialog',
      disableClose: false,
      autoFocus: false,
    });
  }

  telegramLink = signal<string>("");
  async generateTelegramToken() {
    const res = await this.authService.generateTelegramToken();
    this.telegramLink.set(`${environment.telegramUrl}?start=${res}`);

    if (res) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (isMobile) {
        window.location.href = this.telegramLink();
      } else {
        this.openDialog(this.telegramLink());
      }
    }
  }

  openDialog(link: string) {
    const dialogRef = this.dialog.open(QrModal, {
      width: '400px',
      disableClose: true,
      autoFocus: false,
      data: { telegramLink: link }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.stateStore.updateProfile(this.stateStore.profile()?.id, { receiveMessages: true });
        this.stateStore.loadProfile();
      }
    });
  }

  openEmailVerification() {
    const dialogRef = this.dialog.open(EmailVerifyModal, {
      width: '450px',
      maxWidth: '95vw',
      data: { email: this.stateStore.profile().email },
      disableClose: false,
      autoFocus: false,
    });

    dialogRef.afterClosed().subscribe(verified => {
      if (verified) {
        this.stateStore.updateProfile(this.stateStore.profile()?.id, { receiveMessages: true });
        this.stateStore.loadProfile();
      }
    });
  }

  deleteCv() {
    this.stateStore.deleteCv();
  }

  uploadCv(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.stateStore.uploadCv(file);
    }
  }

  switchToEmail() {
    this.stateStore.updateProfile(this.stateStore.profile()?.id, { telegramChatId: '' });
  }

  openOnboardingWizard(step: number = 1) {
    const dialogRef = this.dialog.open(Onboarding, {
      width: '1100px',
      maxWidth: '96vw',
      maxHeight: '94vh',
      panelClass: 'onboarding-dialog',
      disableClose: false,
      autoFocus: false,
    });

    if (dialogRef.componentInstance) {
      dialogRef.componentInstance.goToStep(step);
    }

    dialogRef.afterClosed().subscribe(async () => {
      await this.stateStore.loadProfile(true);
      await this.stateStore.getCv(true);
    });
  }
}

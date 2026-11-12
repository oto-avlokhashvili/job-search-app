import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Job } from '../../../Core/Interfaces/jobs';
import { AuthService } from '../../../Core/Services/auth-service';
import { Cv } from '../../../Core/Services/cv';
import { QuickApplyService } from '../../../Core/Services/quick-apply';
import { PUBLIC_CV_STORAGE_KEY } from '../../../Core/Utils/public-cv-storage';
import { rememberQuickApplied } from '../../../Core/Utils/quick-apply-storage';
import { loadTurnstile } from '../../../Core/Utils/turnstile';
import { StateStore } from '../../../Store/state.store';
import type { SavedCvSubmission } from '../public-cv-modal/public-cv-modal';

export interface QuickApplyModalData {
  job: Pick<Job, 'id' | 'vacancy' | 'company' | 'link'>;
  /** The address the vacancy names (Job.applyEmail) */
  email: string;
}

/** Closes with true once the CV was sent (or had been sent before), so the page can show "sent". */
@Component({
  selector: 'app-quick-apply-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './quick-apply-modal.html',
  // The form, dropzone and success styles are the public CV modal's
  styleUrls: ['../public-cv-modal/public-cv-modal.scss', './quick-apply-modal.scss'],
})
export class QuickApplyModal {
  private dialogRef = inject(MatDialogRef<QuickApplyModal>);
  private quickApply = inject(QuickApplyService);
  private cvService = inject(Cv);
  private stateStore = inject(StateStore);
  readonly auth = inject(AuthService);
  readonly data = inject<QuickApplyModalData>(MAT_DIALOG_DATA);

  readonly isLoggedIn = this.auth.isLoggedIn();
  view = signal<'choose' | 'form' | 'success' | 'already'>('choose');

  // Signed in: the CV on their account (null = none), and whether they pick another file instead
  myCvName = signal<string | null>(null);
  myCvLoading = signal(false);
  replaceCv = signal(false);

  selectedFile = signal<File | null>(null);
  isDragging = signal(false);
  loading = signal(false);
  hasAttemptedSubmit = signal(false);
  formError = signal('');
  copied = signal(false);

  // Name and phone are read from the chosen CV and shown, not typed; "edit" opens them as inputs
  readingCv = signal(false);
  cvRead = signal(false);
  editingDetails = signal(false);
  /** The email came from the CV: it's shown in the card and the email field stays hidden */
  emailFromCv = signal(false);
  /** Remembered from an earlier CV upload on the site; used when the CV shows no email */
  private savedEmail = '';
  private readToken = 0;

  readonly allowedExtensions = ['pdf', 'docx', 'doc'];
  readonly maxSizeMB = 5;

  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  form = new FormGroup({
    fullName: new FormControl('', [Validators.maxLength(150)]),
    email: new FormControl('', this.isLoggedIn ? [] : [Validators.required, Validators.email]),
    // Georgian 9 digits, or an international number read from the CV
    phoneNumber: new FormControl('', [Validators.pattern('^\\+?[0-9 ]{9,19}$')]),
    consent: new FormControl(false, [Validators.requiredTrue]),
  });

  // ─── Turnstile (anonymous only), as in the public CV modal ───
  readonly turnstileEnabled = !!environment.turnstileSiteKey && !this.isLoggedIn;
  turnstileToken = signal('');
  private turnstileWidgetId: string | null = null;
  private turnstileHostEl: HTMLElement | null = null;

  // The host appears only on the form view; render once per element
  @ViewChild('turnstileHost') set turnstileHost(el: ElementRef<HTMLElement> | undefined) {
    const host = el?.nativeElement ?? null;
    if (!this.turnstileEnabled || host === this.turnstileHostEl) return;
    this.turnstileHostEl = host;
    this.turnstileWidgetId = null;
    this.turnstileToken.set('');
    if (host) this.renderTurnstile(host);
  }

  private async renderTurnstile(host: HTMLElement) {
    try {
      const turnstile = await loadTurnstile();
      if (host !== this.turnstileHostEl || !host.isConnected) return;
      this.turnstileWidgetId = turnstile.render(host, {
        sitekey: environment.turnstileSiteKey,
        callback: (token: string) => this.turnstileToken.set(token),
        'expired-callback': () => this.turnstileToken.set(''),
        'error-callback': (code: string) => {
          this.turnstileToken.set('');
          console.error(`Turnstile error ${code}`);
          this.formError.set('ბოტისგან დაცვის შემოწმება ვერ მოხერხდა, განაახლეთ გვერდი');
        },
      });
    } catch {
      this.formError.set('ბოტისგან დაცვა ვერ ჩაიტვირთა, განაახლეთ გვერდი');
    }
  }

  private resetTurnstile() {
    this.turnstileToken.set('');
    if (this.turnstileWidgetId) window.turnstile?.reset(this.turnstileWidgetId);
  }

  constructor() {
    if (this.isLoggedIn) {
      this.loadMyCv();
    } else {
      this.prefillFromEarlierUpload();
    }
  }

  // ─── Choose ───

  openForm() {
    this.formError.set('');
    this.view.set('form');
  }

  back() {
    this.formError.set('');
    this.view.set('choose');
  }

  copyEmail() {
    navigator.clipboard?.writeText(this.data.email).then(
      () => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      },
      () => undefined,
    );
  }

  // ─── CV ───

  private async loadMyCv() {
    this.myCvLoading.set(true);
    try {
      const cv = await firstValueFrom(this.cvService.getCV());
      this.myCvName.set(cv?.originalName || cv?.fileName || null);
    } catch {
      this.myCvName.set(null); // 404: no CV on the account yet
    } finally {
      this.myCvLoading.set(false);
    }
  }

  /** The email a visitor gave when they left their CV on the site before. */
  private prefillFromEarlierUpload() {
    try {
      const saved: SavedCvSubmission | null = JSON.parse(localStorage.getItem(PUBLIC_CV_STORAGE_KEY) || 'null');
      if (saved?.email) {
        this.savedEmail = saved.email;
        this.form.patchValue({ email: saved.email });
      }
    } catch {
      // nothing saved
    }
  }

  /** Fills name, phone and email from the CV; the email field is shown only when the CV has no email. */
  private async readCv(file: File) {
    const token = ++this.readToken;
    this.readingCv.set(true);
    this.cvRead.set(false);
    let found = { fullName: null as string | null, email: null as string | null, phoneNumber: null as string | null };
    try {
      found = await firstValueFrom(this.quickApply.preview(file));
    } catch {
      // Unreadable or offline: they can still fill the details in
    }
    if (token !== this.readToken) return; // another file was picked meanwhile

    this.form.patchValue({ fullName: found.fullName || '', phoneNumber: found.phoneNumber || '' });
    if (!this.isLoggedIn) {
      this.emailFromCv.set(!!found.email);
      this.form.patchValue({ email: found.email || this.savedEmail });
      this.form.get('email')?.markAsUntouched();
    }
    // Nothing found to show: open the fields instead of an empty card
    this.editingDetails.set(!this.isLoggedIn && !found.fullName);
    this.readingCv.set(false);
    this.cvRead.set(true);
  }

  /** A file is needed unless a signed-in user sends the CV already on their account. */
  get needsFile(): boolean {
    return !this.isLoggedIn || !this.myCvName() || this.replaceCv();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.handleFile(file);
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.handleFile(file);
  }

  private handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!this.allowedExtensions.includes(ext)) {
      this.formError.set('გთხოვთ ატვირთოთ მხოლოდ PDF ან Word (.docx, .doc) ფაილი');
      return;
    }
    if (file.size > this.maxSizeMB * 1024 * 1024) {
      this.formError.set(`ფაილის ზომა არ უნდა აღემატებოდეს ${this.maxSizeMB}MB-ს`);
      return;
    }
    this.formError.set('');
    this.selectedFile.set(file);
    this.readCv(file);
  }

  removeFile(event?: Event) {
    event?.stopPropagation();
    this.readToken++;
    this.selectedFile.set(null);
    this.readingCv.set(false);
    this.cvRead.set(false);
    this.editingDetails.set(false);
    if (this.emailFromCv()) this.form.patchValue({ email: this.savedEmail });
    this.emailFromCv.set(false);
    this.form.patchValue({ fullName: '', phoneNumber: '' });
    if (this.fileInputRef?.nativeElement) this.fileInputRef.nativeElement.value = '';
  }

  useAccountCv() {
    this.replaceCv.set(false);
    this.removeFile();
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  invalid(name: 'fullName' | 'email' | 'phoneNumber' | 'consent'): boolean {
    const control = this.form.get(name);
    return !!control?.invalid && (control.touched || this.hasAttemptedSubmit());
  }

  // ─── Send ───

  async submit() {
    this.formError.set('');
    this.hasAttemptedSubmit.set(true);
    this.form.markAllAsTouched();

    const error = this.validationError();
    if (error) {
      this.formError.set(error);
      return;
    }
    if (this.turnstileEnabled && !this.turnstileToken()) {
      this.formError.set('გთხოვთ დაელოდოთ ბოტისგან დაცვის შემოწმებას');
      return;
    }

    this.loading.set(true);
    const value = this.form.getRawValue();
    const fullName = value.fullName?.trim() || undefined;
    const email = value.email?.trim() || undefined;
    const phoneNumber = value.phoneNumber?.trim() || undefined;
    const file = this.needsFile ? this.selectedFile() : null;
    try {
      const res = await firstValueFrom(
        this.quickApply.apply(this.data.job.id, {
          consent: true,
          file,
          fullName: this.isLoggedIn ? undefined : fullName,
          email: this.isLoggedIn ? undefined : email,
          phoneNumber,
          turnstileToken: this.turnstileToken() || undefined,
        }),
      );
      rememberQuickApplied(this.data.job.id);
      if (!this.isLoggedIn && email) {
        // Same record the public CV upload keeps: the CV is in the base now and CV search works
        this.saveSubmission({ email, fullName, phoneNumber, fileName: file?.name, submittedAt: new Date().toISOString(), searchToken: res.searchToken });
      }
      if (this.isLoggedIn && file) this.myCvName.set(file.name);
      this.view.set('success');
    } catch (err: any) {
      this.handleError(err);
      this.resetTurnstile();
    } finally {
      this.loading.set(false);
    }
  }

  private validationError(): string | null {
    if (this.needsFile && !this.selectedFile()) return 'გთხოვთ აირჩიოთ თქვენი CV ფაილი';
    if (this.readingCv()) return 'დაელოდეთ, CV იკითხება';
    if (!this.isLoggedIn && this.form.get('email')?.invalid) {
      // A bad address read from the CV: open the card's fields to fix it
      if (this.emailFromCv()) this.editingDetails.set(true);
      return 'გთხოვთ მიუთითოთ ვალიდური ელ-ფოსტის მისამართი';
    }
    if (this.form.get('fullName')?.invalid) return 'სახელი ძალიან გრძელია';
    if (this.form.get('phoneNumber')?.invalid) {
      this.editingDetails.set(true);
      return 'ტელეფონის ნომერი არასწორია';
    }
    if (this.form.get('consent')?.invalid) return 'გთხოვთ დაადასტუროთ თანხმობა';
    return null;
  }

  private handleError(err: any) {
    const code = err?.error?.code;
    if (err?.status === 409 || code === 'ALREADY_APPLIED') {
      rememberQuickApplied(this.data.job.id);
      this.view.set('already');
      return;
    }
    if (code === 'NO_CV') {
      this.myCvName.set(null);
      this.formError.set('თქვენს ანგარიშზე CV არ არის, გთხოვთ ატვირთოთ');
      return;
    }
    if (code === 'NO_APPLY_EMAIL') {
      this.formError.set('ამ ვაკანსიაზე განაცხადი წყარო საიტზე იგზავნება');
      return;
    }
    if (err?.status === 429) {
      const message = err.error?.message;
      const isOurs = typeof message === 'string' && /[Ⴀ-ჿ]/.test(message);
      this.formError.set(isOurs ? message : 'ძალიან ბევრი მცდელობა, სცადეთ ცოტა ხანში');
      return;
    }
    const message = err?.error?.message;
    this.formError.set(
      typeof message === 'string' ? message : Array.isArray(message) ? message[0] : 'CV ვერ გაიგზავნა, გთხოვთ სცადოთ თავიდან',
    );
  }

  private saveSubmission(data: SavedCvSubmission) {
    try {
      const previous: SavedCvSubmission | null = JSON.parse(localStorage.getItem(PUBLIC_CV_STORAGE_KEY) || 'null');
      localStorage.setItem(PUBLIC_CV_STORAGE_KEY, JSON.stringify({ ...previous, ...data, searchAvailable: previous?.searchAvailable }));
    } catch {
      // storage unavailable
    }
  }

  close() {
    const sent = this.view() === 'success' || this.view() === 'already';
    this.dialogRef.close(sent);
  }

  get profileName(): string {
    const p = this.stateStore.profile();
    return p && p.id ? `${p.firstName} ${p.lastName}`.trim() : '';
  }

  get profileEmail(): string {
    return this.stateStore.profile()?.email || '';
  }
}

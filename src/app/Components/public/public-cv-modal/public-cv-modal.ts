import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Cv } from '../../../Core/Services/cv';
import { StateStore } from '../../../Store/state.store';
import { firstValueFrom } from 'rxjs';
import { PUBLIC_CV_STORAGE_KEY } from '../../../Core/Utils/public-cv-storage';
import { loadTurnstile } from '../../../Core/Utils/turnstile';
import { environment } from '../../../../environments/environment';

export interface SavedCvSubmission {
  email: string;
  fullName?: string;
  phoneNumber?: string;
  fileName?: string;
  submittedAt: string;
  /** Unlocks anonymous CV search (sent as X-CV-Token); replaced on every upload. */
  searchToken?: string;
  /** False when the API saved the CV but couldn't analyze it, so CV search won't work. */
  searchAvailable?: boolean;
}

export interface PublicCvModalData {
  /** 'search' frames the same upload as CV-based vacancy search (vacancies page). */
  mode?: 'talent-pool' | 'search';
  /** Skip the "already submitted" summary and open straight on the upload form. */
  reupload?: boolean;
}

@Component({
  selector: 'app-public-cv-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './public-cv-modal.html',
  styleUrl: './public-cv-modal.scss',
})
export class PublicCvModal {
  dialogRef = inject(MatDialogRef<PublicCvModal>);
  private cvService = inject(Cv);
  private stateStore = inject(StateStore);
  private data = inject<PublicCvModalData | null>(MAT_DIALOG_DATA, { optional: true });

  isSearchMode = this.data?.mode === 'search';

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  readonly turnstileEnabled = !!environment.turnstileSiteKey;
  turnstileToken = signal<string>('');
  private turnstileWidgetId: string | null = null;
  private turnstileHostEl: HTMLElement | null = null;

  // The form (and this host) is re-created whenever it reappears, e.g. after "re-upload".
  // Angular can call this setter again with the same element, so render once per element:
  // a second render is rejected by Turnstile, and resetting first would wipe a valid token.
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
      // The form may have been swapped out while the script loaded.
      if (host !== this.turnstileHostEl || !host.isConnected) return;
      // No `language`: Turnstile has no Georgian and picks the browser's language itself.
      this.turnstileWidgetId = turnstile.render(host, {
        sitekey: environment.turnstileSiteKey,
        callback: (token: string) => this.turnstileToken.set(token),
        'expired-callback': () => this.turnstileToken.set(''),
        'error-callback': (code: string) => {
          this.turnstileToken.set('');
          // 110200 = this hostname isn't in the widget's allowed hostnames (e.g. localhost).
          console.error(`Turnstile error ${code}`);
          this.showError('ბოტისგან დაცვის შემოწმება ვერ მოხერხდა, განაახლეთ გვერდი');
        },
      });
    } catch {
      this.showError('ბოტისგან დაცვა ვერ ჩაიტვირთა, განაახლეთ გვერდი');
    }
  }

  /** Turnstile tokens are single-use: get a fresh one after a failed submit. */
  private resetTurnstile() {
    this.turnstileToken.set('');
    if (this.turnstileWidgetId) window.turnstile?.reset(this.turnstileWidgetId);
  }

  selectedFile = signal<File | null>(null);
  isDragging = signal<boolean>(false);
  loading = signal<boolean>(false);
  isSuccess = signal<boolean>(false);
  successMessage = signal<string>('');
  hasAttemptedSubmit = signal<boolean>(false);
  formError = signal<string>('');

  isAlreadySubmitted = signal<boolean>(false);
  submittedInfo = signal<SavedCvSubmission | null>(null);

  allowedExtensions = ['pdf', 'docx', 'doc'];
  maxSizeMB = 5;

  form = new FormGroup({
    email: new FormControl(this.stateStore.profile()?.email || '', [
      Validators.required,
      Validators.email,
    ]),
    fullName: new FormControl(''),
    phoneNumber: new FormControl('', [
      Validators.minLength(9),
      Validators.maxLength(9),
      Validators.pattern('^[0-9]*$'),
    ]),
    consent: new FormControl(false, [Validators.requiredTrue]),
  });

  constructor() {
    this.checkExistingSubmission();
    // A submission saved before CV search existed has no token, so it can't be searched with.
    const unsearchable = this.isSearchMode && !this.submittedInfo()?.searchToken;
    if ((this.data?.reupload || unsearchable) && this.isAlreadySubmitted()) {
      this.retryUpload();
    }
  }

  private checkExistingSubmission() {
    try {
      const stored = localStorage.getItem(PUBLIC_CV_STORAGE_KEY);
      if (stored) {
        const parsed: SavedCvSubmission = JSON.parse(stored);
        if (parsed && parsed.email) {
          this.submittedInfo.set(parsed);
          this.isAlreadySubmitted.set(true);
        }
      }
    } catch (e) {
      console.error('Error reading saved CV submission', e);
    }
  }

  retryUpload() {
    const prev = this.submittedInfo();
    if (prev) {
      this.form.patchValue({
        email: prev.email || this.stateStore.profile()?.email || '',
        fullName: prev.fullName || '',
        phoneNumber: prev.phoneNumber || '',
        consent: false,
      });
    }
    this.selectedFile.set(null);
    this.isAlreadySubmitted.set(false);
    this.isSuccess.set(false);
    this.hasAttemptedSubmit.set(false);
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year}, ${hours}:${minutes}`;
    } catch {
      return dateStr;
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.handleFile(event.dataTransfer.files[0]);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!this.allowedExtensions.includes(ext)) {
      this.showError('გთხოვთ ატვირთოთ მხოლოდ PDF ან Word (.docx, .doc) ფაილი');
      return;
    }

    if (file.size > this.maxSizeMB * 1024 * 1024) {
      this.showError(`ფაილის ზომა არ უნდა აღემატებოდეს ${this.maxSizeMB}MB-ს`);
      return;
    }

    this.formError.set('');
    this.selectedFile.set(file);
  }

  removeFile(event?: Event) {
    if (event) event.stopPropagation();
    this.selectedFile.set(null);
    if (this.fileInputRef?.nativeElement) {
      this.fileInputRef.nativeElement.value = '';
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async submit() {
    this.formError.set('');
    this.hasAttemptedSubmit.set(true);
    this.form.markAllAsTouched();

    let hasError = false;

    if (!this.selectedFile()) {
      this.showError('გთხოვთ აირჩიოთ თქვენი CV ფაილი');
      hasError = true;
    }

    if (this.form.get('email')?.invalid) {
      if (!hasError) {
        this.showError('გთხოვთ მიუთითოთ ვალიდური ელ-ფოსტის მისამართი');
      }
      hasError = true;
    }

    if (this.form.get('phoneNumber')?.invalid) {
      if (!hasError) {
        this.showError('ტელეფონის ნომერი უნდა შედგებოდეს 9 ციფრისგან');
      }
      hasError = true;
    }

    if (this.form.get('consent')?.invalid) {
      if (!hasError) {
        this.showError('გთხოვთ დაადასტუროთ თანხმობა');
      }
      hasError = true;
    }

    if (hasError) {
      return;
    }

    if (this.turnstileEnabled && !this.turnstileToken()) {
      this.showError('გთხოვთ დაელოდოთ ბოტისგან დაცვის შემოწმებას');
      return;
    }

    this.loading.set(true);

    try {
      const email = this.form.value.email?.trim() || '';
      const fullName = this.form.value.fullName?.trim() || undefined;
      const phoneNumber = this.form.value.phoneNumber?.trim() || undefined;

      const res = await firstValueFrom(
        this.cvService.submitPublicCv({
          email,
          file: this.selectedFile()!,
          fullName,
          phoneNumber,
          consent: true,
          turnstileToken: this.turnstileToken() || undefined,
        })
      );

      const submissionData: SavedCvSubmission = {
        email,
        fullName,
        phoneNumber,
        fileName: this.selectedFile()?.name,
        submittedAt: new Date().toISOString(),
        searchToken: res?.searchToken,
        searchAvailable: res?.searchAvailable,
      };
      try {
        localStorage.setItem(PUBLIC_CV_STORAGE_KEY, JSON.stringify(submissionData));
        this.submittedInfo.set(submissionData);
      } catch (e) {
        console.error('Error saving submission to localStorage', e);
      }

      this.isSuccess.set(true);
      this.successMessage.set(res?.message || 'თქვენი CV წარმატებით დაემატა კანდიდატების ბაზაში! 🎉');
    } catch (err: any) {
      this.showError(this.uploadErrorMessage(err));
      this.resetTurnstile();
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Shown inline above the submit button: toasts render underneath the dialog, which sits
   * in the browser's top layer.
   */
  private showError(message: string) {
    this.formError.set(message);
  }

  private uploadErrorMessage(err: any): string {
    if (err?.status === 429) {
      // Our daily limits send a Georgian message plus retryAfter; the 10-minute throttle sends neither.
      const minutes = err.error?.retryAfter ? Math.ceil(err.error.retryAfter / 60) : null;
      const isOurMessage = typeof err.error?.message === 'string' && /[Ⴀ-ჿ]/.test(err.error.message);
      if (isOurMessage) return err.error.message;
      return `ძალიან ბევრი მცდელობა, სცადეთ ${minutes ?? 10} წუთში`;
    }
    return err?.error?.message || 'დაფიქსირდა შეცდომა CV-ს ატვირთვისას. გთხოვთ სცადოთ თავიდან.';
  }

  close() {
    this.dialogRef.close(this.isSuccess());
  }

  /** Search mode: hand control back to the vacancies page to run the CV search. */
  searchWithCv() {
    this.dialogRef.close('search');
  }
}

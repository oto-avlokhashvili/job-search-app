import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Cv } from '../../../Core/Services/cv';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { StateStore } from '../../../Store/state.store';
import { firstValueFrom } from 'rxjs';

export interface SavedCvSubmission {
  email: string;
  fullName?: string;
  phoneNumber?: string;
  fileName?: string;
  submittedAt: string;
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
  private alertify = inject(AlertifyService);
  private stateStore = inject(StateStore);

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  selectedFile = signal<File | null>(null);
  isDragging = signal<boolean>(false);
  loading = signal<boolean>(false);
  isSuccess = signal<boolean>(false);
  successMessage = signal<string>('');
  hasAttemptedSubmit = signal<boolean>(false);

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
  }

  private checkExistingSubmission() {
    try {
      const stored = localStorage.getItem('public_cv_submission');
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
      this.alertify.error('გთხოვთ ატვირთოთ მხოლოდ PDF ან Word (.docx, .doc) ფაილი');
      return;
    }

    if (file.size > this.maxSizeMB * 1024 * 1024) {
      this.alertify.error(`ფაილის ზომა არ უნდა აღემატებოდეს ${this.maxSizeMB}MB-ს`);
      return;
    }

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
    this.hasAttemptedSubmit.set(true);
    this.form.markAllAsTouched();

    let hasError = false;

    if (!this.selectedFile()) {
      this.alertify.error('გთხოვთ აირჩიოთ თქვენი CV ფაილი');
      hasError = true;
    }

    if (this.form.get('email')?.invalid) {
      if (!hasError) {
        this.alertify.error('გთხოვთ მიუთითოთ ვალიდური ელ-ფოსტის მისამართი');
      }
      hasError = true;
    }

    if (this.form.get('phoneNumber')?.invalid) {
      if (!hasError) {
        this.alertify.error('ტელეფონის ნომერი უნდა შედგებოდეს 9 ციფრისგან');
      }
      hasError = true;
    }

    if (this.form.get('consent')?.invalid) {
      if (!hasError) {
        this.alertify.error('გთხოვთ დაადასტუროთ თანხმობა');
      }
      hasError = true;
    }

    if (hasError) {
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
        })
      );

      const submissionData: SavedCvSubmission = {
        email,
        fullName,
        phoneNumber,
        fileName: this.selectedFile()?.name,
        submittedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem('public_cv_submission', JSON.stringify(submissionData));
        this.submittedInfo.set(submissionData);
      } catch (e) {
        console.error('Error saving submission to localStorage', e);
      }

      this.isSuccess.set(true);
      this.successMessage.set(res?.message || 'თქვენი CV წარმატებით დაემატა კანდიდატების ბაზაში! 🎉');
    } catch (err: any) {
      const msg = err?.error?.message || 'დაფიქსირდა შეცდომა CV-ს ატვირთვისას. გთხოვთ სცადოთ თავიდან.';
      this.alertify.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  close() {
    this.dialogRef.close(this.isSuccess());
  }
}

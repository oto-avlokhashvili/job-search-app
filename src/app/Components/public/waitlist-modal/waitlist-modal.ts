import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { WaitlistService } from '../../../Core/Services/waitlist.service';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { StateStore } from '../../../Store/state.store';

export interface WaitlistModalData {
  plan: 'PRO' | 'ENTERPRISE' | string;
  source?: string;
}

@Component({
  selector: 'app-waitlist-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './waitlist-modal.html',
  styleUrl: './waitlist-modal.scss',
})
export class WaitlistModal {
  dialogRef = inject(MatDialogRef<WaitlistModal>);
  data = inject<WaitlistModalData>(MAT_DIALOG_DATA, { optional: true });
  private waitlistService = inject(WaitlistService);
  private alertify = inject(AlertifyService);
  private stateStore = inject(StateStore);

  plan = signal<'PRO' | 'ENTERPRISE' | string>(this.data?.plan || 'PRO');
  isEnterprise = signal<boolean>((this.data?.plan || 'PRO').toUpperCase() === 'ENTERPRISE');
  source = this.data?.source || 'landing';

  loading = signal<boolean>(false);
  isSuccess = signal<boolean>(false);
  successMessage = signal<string>('');

  form = new FormGroup({
    email: new FormControl(this.stateStore.profile()?.email || '', [
      Validators.required,
      Validators.email,
    ]),
    notes: new FormControl(''),
  });

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.alertify.error('გთხოვთ მიუთითოთ ვალიდური ელ-ფოსტის მისამართი');
      return;
    }

    this.loading.set(true);
    try {
      const email = this.form.value.email?.trim();
      const notes = this.form.value.notes?.trim() || undefined;

      const res = await this.waitlistService.join({
        email,
        plan: this.plan(),
        source: this.source,
        notes,
      });

      this.isSuccess.set(true);
      this.successMessage.set(res.message || 'გმადლობთ! თქვენ წარმატებით დაემატეთ Waitlist-ში 🎉');
    } catch (err: any) {
      const msg = err?.error?.message || 'დაფიქსირდა შეცდომა, გთხოვთ სცადოთ მოგვიანებით';
      this.alertify.error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  close() {
    this.dialogRef.close(this.isSuccess());
  }
}

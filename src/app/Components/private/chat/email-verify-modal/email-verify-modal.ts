import { CommonModule } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../../../../Core/Services/auth-service';

@Component({
  selector: 'app-email-verify-modal',
  standalone: true,
  imports: [MatDialogModule, CommonModule, FormsModule],
  templateUrl: './email-verify-modal.html',
  styleUrl: './email-verify-modal.scss',
})
export class EmailVerifyModal implements OnInit, OnDestroy {
  isDarkMode = signal(localStorage.getItem('app-theme') === 'dark' || false);
  verificationCode = signal<string>('');
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  resendCooldown = signal<number>(0);
  private timerInterval: any = null;

  constructor(
    public dialogRef: MatDialogRef<EmailVerifyModal>,
    @Inject(MAT_DIALOG_DATA) public data: { email: string },
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Start with a small cooldown or let them resend immediately. Let's start with 0.
  }

  ngOnDestroy() {
    this.clearTimer();
  }

  async verify() {
    const code = this.verificationCode().trim();
    if (!code || code.length !== 6) {
      this.errorMessage.set('გთხოვთ შეიყვანოთ სწორი 6-ნიშნა კოდი');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      await this.authService.verifyEmail(this.data.email, code);
      this.successMessage.set('ელ-ფოსტა წარმატებით დადასტურდა!');
      setTimeout(() => {
        this.dialogRef.close(true);
      }, 1500);
    } catch (err: any) {
      console.error('Email verification error:', err);
      const msg = err.error?.message || 'დადასტურება ვერ მოხერხდა. გთხოვთ შეამოწმოთ კოდი.';
      this.errorMessage.set(msg);
    } finally {
      this.isLoading.set(false);
    }
  }

  async resendCode() {
    if (this.resendCooldown() > 0) return;

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      await this.authService.resendVerification(this.data.email);
      this.successMessage.set('კოდი ხელახლა გაიგზავნა თქვენს ელ-ფოსტაზე!');
      this.startCooldown();
    } catch (err: any) {
      console.error('Error resending email verification code:', err);
      const msg = err.error?.message || 'კოდის გაგზავნა ვერ მოხერხდა. სცადეთ მოგვიანებით.';
      this.errorMessage.set(msg);
    } finally {
      this.isLoading.set(false);
    }
  }

  private startCooldown() {
    this.resendCooldown.set(60);
    this.clearTimer();
    this.timerInterval = setInterval(() => {
      const current = this.resendCooldown();
      if (current <= 1) {
        this.resendCooldown.set(0);
        this.clearTimer();
      } else {
        this.resendCooldown.set(current - 1);
      }
    }, 1000);
  }

  private clearTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  close() {
    this.dialogRef.close(false);
  }
}

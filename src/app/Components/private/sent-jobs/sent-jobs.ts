import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { StateStore } from '../../../Store/state.store';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { AuthService } from '../../../Core/Services/auth-service';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionModal } from '../private-layout/subscription-modal/subscription-modal';
import { QrModal } from '../qr-modal/qr-modal';
import { EmailVerifyModal } from '../dashboard/email-verify-modal/email-verify-modal';
import { VacancyDetails } from '../../public/vacancy-details/vacancy-details';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-sent-jobs',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sent-jobs.html',
  styleUrl: './sent-jobs.scss',
})
export class SentJobs implements OnInit {
  stateStore = inject(StateStore);
  authService = inject(AuthService);
  private alertify = inject(AlertifyService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  page = signal<number>(1);
  limit = signal<number>(10);
  telegramLink = signal<string>('');

  initials = computed(() => {
    const u = this.stateStore.profile();
    if (!u) return '';
    return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
  });

  ngOnInit() {
    this.stateStore.ensureDataLoaded();
    const currentPage = this.stateStore.sentJobs()?.page || 1;
    this.page.set(currentPage);
    this.stateStore.loadSentJobs(this.page(), this.limit(), false);
  }

  toggleReceiveMessages(event: any) {
    const checked = event.target.checked;
    this.stateStore.updateProfile(this.stateStore.profile()?.id, { receiveMessages: checked });
    this.alertify.success(checked ? 'შეტყობინებების მიღება გააქტიურდა' : 'შეტყობინებების მიღება გამორთულია');
  }

  onPageChange(page: number) {
    if (page < 1 || (this.stateStore.sentJobs().lastPage && page > this.stateStore.sentJobs().lastPage)) {
      return;
    }
    this.page.set(page);
    this.stateStore.loadSentJobs(page, this.limit(), false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  openVacancyDetails(jobId: number | string) {
    if (!jobId) return;
    this.dialog.open(VacancyDetails, {
      width: '750px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'vacancy-dialog',
      autoFocus: false,
      data: { jobId }
    });
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

  async generateTelegramToken() {
    const res = await this.authService.generateTelegramToken();
    this.telegramLink.set(`${environment.telegramUrl}?start=${res}`);

    if (res) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (isMobile) {
        window.location.href = this.telegramLink();
      } else {
        this.openQrDialog(this.telegramLink());
      }
    }
  }

  openQrDialog(link: string) {
    const dialogRef = this.dialog.open(QrModal, {
      width: '400px',
      disableClose: true,
      autoFocus: false,
      data: { telegramLink: link }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.stateStore.updateProfile(this.stateStore.profile()?.id, { receiveMessages: true });
        this.stateStore.loadProfile(true);
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
        this.stateStore.loadProfile(true);
      }
    });
  }

  switchToEmail() {
    this.stateStore.updateProfile(this.stateStore.profile()?.id, { telegramChatId: '' });
  }

  navigateToProfile() {
    this.router.navigate(['/private/profile']);
  }
}

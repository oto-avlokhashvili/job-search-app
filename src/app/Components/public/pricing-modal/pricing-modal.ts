import { Component, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { AuthService } from '../../../Core/Services/auth-service';
import { WaitlistService } from '../../../Core/Services/waitlist.service';
import { StateStore } from '../../../Store/state.store';
import { SubscriptionModal } from '../subscription-modal/subscription-modal';
import { WaitlistModal } from '../waitlist-modal/waitlist-modal';

/** The plans (Basic, Pro, Enterprise), opened from the header and the home page's footer. */
@Component({
  selector: 'app-pricing-modal',
  standalone: true,
  templateUrl: './pricing-modal.html',
  styleUrl: './pricing-modal.scss',
})
export class PricingModal {
  authService = inject(AuthService);
  stateStore = inject(StateStore);
  waitlistService = inject(WaitlistService);
  private dialog = inject(MatDialog);
  private dialogRef = inject(MatDialogRef<PricingModal>);
  private alertify = inject(AlertifyService);

  close() {
    this.dialogRef.close();
  }

  joinProWaitlist() {
    if (this.waitlistService.isEnrolled('PRO')) {
      this.alertify.success('თქვენ უკვე დარეგისტრირებული ხართ Pro პაკეტის Waitlist-ში! 🎉');
      return;
    }
    this.dialog.open(WaitlistModal, {
      width: '480px',
      maxWidth: '95vw',
      panelClass: 'waitlist-dialog',
      autoFocus: false,
      data: { plan: 'PRO', source: 'landing_pricing' },
    });
  }

  joinEnterpriseWaitlist() {
    if (this.waitlistService.isEnrolled('ENTERPRISE')) {
      this.alertify.success('თქვენ უკვე დარეგისტრირებული ხართ Enterprise Waitlist-ში! 🎉');
      return;
    }
    this.dialog.open(WaitlistModal, {
      width: '480px',
      maxWidth: '95vw',
      panelClass: 'waitlist-dialog',
      autoFocus: false,
      data: { plan: 'ENTERPRISE', source: 'landing_enterprise_card' },
    });
  }

  handlePlanClick(planKey: string) {
    if (planKey === 'PRO') {
      this.joinProWaitlist();
      return;
    }
    if (planKey === 'PREMIUM' || planKey === 'ENTERPRISE') {
      this.joinEnterpriseWaitlist();
      return;
    }
    if (this.authService.isLoggedIn()) {
      this.dialog.open(SubscriptionModal, {
        width: '960px',
        maxWidth: '96vw',
        panelClass: 'subscription-dialog',
        autoFocus: false,
      });
    } else {
      this.dialogRef.close();
      this.authService.openAuthModal('register');
    }
  }
}

import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

/** Pricing and contact are dialogs, not page sections: the header and the home footer open them. */
@Injectable({ providedIn: 'root' })
export class SiteModalsService {
  private dialog = inject(MatDialog);

  async openPricing() {
    const { PricingModal } = await import('../../Components/public/pricing-modal/pricing-modal');
    this.dialog.open(PricingModal, { width: '1180px', maxWidth: '96vw', panelClass: 'site-modal', autoFocus: false });
  }

  async openContact() {
    const { ContactModal } = await import('../../Components/public/contact-modal/contact-modal');
    this.dialog.open(ContactModal, { width: '980px', maxWidth: '96vw', panelClass: 'site-modal', autoFocus: false });
  }
}

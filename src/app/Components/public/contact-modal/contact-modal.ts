import { Component, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { ContactSection } from '../contact-section/contact-section';

/** "Write us a message" (the /contact page's section), opened from the header and the home page's footer. */
@Component({
  selector: 'app-contact-modal',
  standalone: true,
  imports: [ContactSection],
  template: `
    <!-- Pinned to the top while the form scrolls -->
    <div class="modal-close-row">
      <button type="button" class="modal-close" (click)="close()" aria-label="დახურვა">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <app-contact-section />
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      max-height: 92svh;
      overflow-y: auto;
      border-radius: 24px;
      background: var(--surface, #f4f6ff);
    }

    .modal-close-row {
      position: sticky;
      top: 0;
      z-index: 3;
      height: 0;
      display: flex;
      justify-content: flex-end;
    }

    .modal-close {
      margin: 14px 14px 0 0;
      flex-shrink: 0;
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      border: 1px solid var(--border-color);
      background: var(--card-bg);
      color: var(--on-surface);
      cursor: pointer;
    }

    .modal-close:hover {
      border-color: var(--primary);
      color: var(--primary);
    }

    // The section's page spacing, reduced for the dialog
    app-contact-section ::ng-deep .newsletter-section {
      padding: 0 !important;
      margin: 0 !important;
      min-height: 0 !important;
    }

    // Phones: the heading starts under the close button
    @media (max-width: 576px) {
      app-contact-section ::ng-deep .newsletter-info > :first-child {
        padding-right: 48px;
      }
    }

    // The dialog is the card: the section's own (see-through) card goes
    app-contact-section ::ng-deep .newsletter-card {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
    }
  `,
})
export class ContactModal {
  private dialogRef = inject(MatDialogRef<ContactModal>);

  close() {
    this.dialogRef.close();
  }
}

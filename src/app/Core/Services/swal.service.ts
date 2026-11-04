import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface ConfirmOptions {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: 'warning' | 'question' | 'info';
  /** Styles the confirm button as destructive (e.g. disconnect, delete). */
  danger?: boolean;
}

// sweetalert2 touches `document` when imported, which crashes SSR.
// Load it lazily and only in the browser (same as AlertifyService).
@Injectable({
  providedIn: 'root'
})
export class SwalService {
  private platformId = inject(PLATFORM_ID);
  private swalPromise: Promise<typeof import('sweetalert2')> | null = null;

  private getSwal() {
    if (!isPlatformBrowser(this.platformId)) return null;
    if (!this.swalPromise) this.swalPromise = import('sweetalert2');
    return this.swalPromise;
  }

  /** Resolves true when the user confirms; false on cancel, dismiss or during SSR. */
  async confirm(options: ConfirmOptions): Promise<boolean> {
    const swal = await this.getSwal();
    if (!swal) return false;

    const result = await swal.default.fire({
      title: options.title,
      text: options.text,
      icon: options.icon ?? 'warning',
      showCancelButton: true,
      confirmButtonText: options.confirmText ?? 'დადასტურება',
      cancelButtonText: options.cancelText ?? 'გაუქმება',
      reverseButtons: true,
      focusCancel: options.danger,
      buttonsStyling: false,
      customClass: {
        popup: 'app-swal',
        confirmButton: `app-swal-btn ${options.danger ? 'danger' : 'primary'}`,
        cancelButton: 'app-swal-btn secondary',
      },
    });
    return result.isConfirmed;
  }
}

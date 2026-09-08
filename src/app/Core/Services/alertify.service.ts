import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

// alertifyjs touches `document` as a side effect of being imported, which crashes SSR.
// Load it lazily and only in the browser.
@Injectable({
  providedIn: 'root'
})
export class AlertifyService {
  private platformId = inject(PLATFORM_ID);
  private alertifyPromise: Promise<typeof import('alertifyjs')> | null = null;

  constructor() { }

  private getAlertify() {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    if (!this.alertifyPromise) {
      this.alertifyPromise = import('alertifyjs');
    }
    return this.alertifyPromise;
  }

  success(message: string) {
    this.getAlertify()?.then(({ default: alertify }) => alertify.success(message));
  }

  error(message: string) {
    this.getAlertify()?.then(({ default: alertify }) => alertify.error(message));
  }

  warning(message: string) {
    this.getAlertify()?.then(({ default: alertify }) => alertify.warning(message));
  }

  message(message: string) {
    this.getAlertify()?.then(({ default: alertify }) => alertify.message(message));
  }

  prompt(
    title: string,
    message: string,
    value: string,
    onOk: (evt: any, value: string) => void,
    onCancel?: () => void
  ) {
    this.getAlertify()?.then(({ default: alertify }) => alertify.prompt(title, message, value, onOk, onCancel));
  }

  confirm(
    title: string,
    message: string,
    onOk: () => void,
    onCancel?: () => void
  ) {
    this.getAlertify()?.then(({ default: alertify }) => alertify.confirm(title, message, onOk, onCancel));
  }
}


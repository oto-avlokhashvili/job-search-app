import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { GoogleConnection } from '../Interfaces/hr';
import { HrService } from './hr';

/** The callback page reports here; Google's pages cut the popup off from window.opener, so no postMessage. */
export const GOOGLE_CALENDAR_CHANNEL = 'google-calendar';
/** Where the callback page returns to when it isn't a popup (popup blocked: whole-page redirect). */
export const GOOGLE_CALENDAR_RETURN_KEY = 'google-calendar-return';

export interface GoogleConnectResult {
  ok: boolean;
  connection?: GoogleConnection;
  error?: string;
}

/**
 * The HR's Google account for Meet links: shared by the interview dialog and the interviews page.
 * Connecting opens Google's consent page in a popup; /google-calendar/callback finishes it.
 */
@Injectable({ providedIn: 'root' })
export class GoogleCalendar {
  private hrService = inject(HrService);

  /** Null until loaded */
  connection = signal<GoogleConnection | null>(null);
  connecting = signal(false);
  private loading: Promise<void> | null = null;

  load(force = false): Promise<void> {
    if (this.loading && !force) return this.loading;
    this.loading = firstValueFrom(this.hrService.getGoogleConnection())
      .then((c) => this.connection.set(c))
      .catch(() => {
        // Unknown: the dialog just offers the manual link field
        this.loading = null;
      });
    return this.loading;
  }

  /** Must run straight from a click, or the popup gets blocked. Resolves once the popup reports back. */
  async connect(): Promise<GoogleConnectResult> {
    // Open first (still inside the click), then point it at Google
    const popup = window.open('', 'google-calendar', 'width=520,height=680');
    this.connecting.set(true);
    let url: string;
    try {
      ({ url } = await firstValueFrom(this.hrService.googleConnectUrl()));
    } catch (err) {
      popup?.close();
      this.connecting.set(false);
      return { ok: false, error: this.hrService.errorMessage(err, 'Google-თან დაკავშირება ვერ მოხერხდა') };
    }
    if (!popup) {
      try {
        sessionStorage.setItem(GOOGLE_CALENDAR_RETURN_KEY, location.pathname + location.search);
      } catch {}
      location.href = url;
      return new Promise(() => {});
    }
    popup.location.href = url;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: GoogleConnectResult) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', onFocus);
        this.connecting.set(false);
        resolve(result);
      };
      const channel = new BroadcastChannel(GOOGLE_CALENDAR_CHANNEL);
      // Also after giving up below: a late success still updates the connection
      channel.onmessage = (e: MessageEvent<GoogleConnectResult>) => {
        channel.close();
        if (e.data.connection) this.connection.set(e.data.connection);
        finish(e.data);
      };
      // Popup closed without finishing (popup.closed can't be trusted after Google's pages): stop waiting once back here
      const onFocus = () =>
        setTimeout(async () => {
          if (settled) return;
          await this.load(true);
          if (!settled) finish({ ok: !!this.connection()?.connected, connection: this.connection() ?? undefined });
        }, 1500);
      window.addEventListener('focus', onFocus);
    });
  }

  async disconnect(): Promise<void> {
    this.connection.set(await firstValueFrom(this.hrService.disconnectGoogle()));
  }
}

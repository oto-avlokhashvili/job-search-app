import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HrService } from '../../../Core/Services/hr';
import { GOOGLE_CALENDAR_CHANNEL, GOOGLE_CALENDAR_RETURN_KEY, GoogleConnectResult } from '../../../Core/Services/google-calendar';

/**
 * Where Google sends the HR back after the consent page (usually inside the popup).
 * Finishes the connection with the HR's own session, tells the opening tab, and closes.
 */
@Component({
  selector: 'app-google-calendar-callback',
  templateUrl: './google-calendar-callback.html',
  styleUrl: './google-calendar-callback.scss',
})
export class GoogleCalendarCallback implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private hrService = inject(HrService);

  result = signal<GoogleConnectResult | null>(null);

  async ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    const state = params.get('state');
    let result: GoogleConnectResult;
    if (!code || !state) {
      // access_denied: the HR pressed cancel on Google's page
      result = { ok: false, error: 'დაკავშირება გაუქმდა' };
    } else {
      try {
        result = { ok: true, connection: await firstValueFrom(this.hrService.finishGoogleConnect(code, state)) };
      } catch (err) {
        result = { ok: false, error: this.hrService.errorMessage(err, 'Google-თან დაკავშირება ვერ მოხერხდა') };
      }
    }
    // The code is single-use: don't keep it in the address bar or history
    history.replaceState(null, '', location.pathname);
    this.result.set(result);

    const channel = new BroadcastChannel(GOOGLE_CALENDAR_CHANNEL);
    channel.postMessage(result);
    channel.close();
    // A popup closes itself; a whole-page redirect (popup blocked) stays and offers the way back
    if (result.ok) setTimeout(() => window.close(), 400);
  }

  back() {
    let target = '/hr/interviews';
    try {
      target = sessionStorage.getItem(GOOGLE_CALENDAR_RETURN_KEY) || target;
      sessionStorage.removeItem(GOOGLE_CALENDAR_RETURN_KEY);
    } catch {}
    window.close();
    this.router.navigateByUrl(target);
  }
}

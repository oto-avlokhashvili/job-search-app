import { Component, effect, inject, PLATFORM_ID, signal, untracked } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { LoadingIndicatorComponent } from "./Core/loading/loading.component";
import { AuthService } from './Core/Services/auth-service';
import { Footer } from './Components/public/footer/footer';
import { Home } from './Components/public/home/home';
import { Header } from './Components/public/header/header';
import { filter, firstValueFrom } from 'rxjs';
import { ThemeService } from './Core/Services/theme.service';
import { Auth } from './Components/public/auth/auth';
import { StateStore } from './Store/state.store';
import { ChatWidget } from './Components/public/chat-widget/chat-widget';

declare let gtag: Function;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingIndicatorComponent, Footer, Header, RouterModule, Auth, ChatWidget],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('job-search-app');
  protected isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  isAuthorized = signal(false);
  authService = inject(AuthService);
  stateStore = inject(StateStore);
  themeService = inject(ThemeService);
  private dialog = inject(MatDialog);
  private authModalOpen$ = toObservable(this.authService.isAuthModalOpen);
  hideLayout = signal(false);
  // Account pages render client-side only; hide the footer from the first paint, as their route data does.
  hideFooter = signal(typeof window !== 'undefined' && /^\/(profile|notifications|analytics)(\/|$)/.test(window.location.pathname));
  showHeroSection = signal(false);
  constructor(private router: Router, private route: ActivatedRoute){
    this.themeService.init();
    this.isAuthorized.set(this.authService.isLoggedIn());
    if (this.authService.isLoggedIn()) {
      this.stateStore.ensureDataLoaded();
    }
    // Public jobs are loaded by the pages that list them; portal counts come from
    // /stats (StateStore loads it on init), so other pages don't wait on /job/all.

    // After every sign-in (header modal, registration, Google redirect) continue the alerts setup at
    // its first missing step. A page load with a stored session is not a sign-in, so it stays quiet.
    let wasLoggedIn: boolean | undefined;
    effect(() => {
      const loggedIn = this.authService.isLoggedIn();
      const signedIn = wasLoggedIn === false && loggedIn;
      wasLoggedIn = loggedIn;
      if (signedIn && this.isBrowser) untracked(() => void this.continueAlertsSetup());
    });

    this.router.events
    .pipe(filter(e => e instanceof NavigationEnd))
    .subscribe((e: NavigationEnd) => {
      let r = this.route.firstChild;
      while (r?.firstChild) r = r.firstChild;
      this.hideLayout.set(r?.snapshot.data['hideLayout'] ?? false);
      this.hideFooter.set(r?.snapshot.data['hideFooter'] ?? false);
      this.showHeroSection.set(r?.snapshot.data['showHeroSection'] ?? false);

      if (this.isBrowser && typeof gtag !== 'undefined') {
        gtag('config', 'G-GT3YDQ98L2', {
          page_path: e.urlAfterRedirects
        });
      }
    });
  }
  private async continueAlertsSetup() {
    // Forced: logging out keeps the previous account's profile and CV in the store.
    await this.stateStore.loadProfile(true);
    await this.stateStore.getCv(true); // also attaches a CV uploaded before signing in
    if (!this.authService.isLoggedIn() || this.stateStore.alertsReady()) return;

    await firstValueFrom(this.authModalOpen$.pipe(filter((open) => !open)));
    const { NotificationChannelsModal, openNotificationChannelsModal } = await import(
      './Components/public/notification-channels-modal/notification-channels-modal'
    );
    // Signing in from the setup's own account step: it is already showing the next step.
    if (this.dialog.openDialogs.some((d) => d.componentInstance instanceof NotificationChannelsModal)) return;
    openNotificationChannelsModal(this.dialog);
  }

  scroll(target: string) {
    document.querySelector(`#${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

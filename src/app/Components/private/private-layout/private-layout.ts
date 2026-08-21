import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal, DestroyRef } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { StateStore } from '../../../Store/state.store';
import { DashboardStore } from '../../../Store/dashboard.store';
import { ThemeService } from '../../../Core/Services/theme.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionModal } from './subscription-modal/subscription-modal';
import { ChatWidget } from '../chat-widget/chat-widget';

@Component({
  selector: 'app-private-layout',
  imports: [RouterModule, CommonModule, ChatWidget],
  templateUrl: './private-layout.html',
  styleUrl: './private-layout.scss',
})
export class PrivateLayout implements OnInit {
  isSidebarOpen = signal<boolean>(false);
  currentYear = signal(new Date().getFullYear());
  router = inject(Router);
  themeService = inject(ThemeService);
  hideFooterAndHeader = signal<boolean>(false);
  destroyRef = inject(DestroyRef);
  route = inject(ActivatedRoute);

  navItems = signal([
    { icon: '🤖', label: 'AI ძიება', route: 'dashboard' },
    { icon: '🔔', label: 'შეტყობინებები', route: 'jobs' },
    { icon: '⚙️', label: 'პროფილი', route: 'profile' },
  ]);

  authService = inject(AuthService);
  stateStore = inject(StateStore);
  dashboardStore = inject(DashboardStore);
  dialog = inject(MatDialog);

  isOnChatRoute = signal<boolean>(this.router.url.includes('/dashboard'));
  isOnboardingRoute = signal<boolean>(this.router.url.includes('/onboarding'));

  isOnboardingCompleted = computed(() => {
    const p = this.stateStore.profile();
    const cv = this.stateStore.userCv();
    const queries = this.stateStore.searchQuery() || [];

    const hasCv = !!cv && !this.stateStore.cvLoading();
    const hasName = !!p?.firstName?.trim() && !!p?.lastName?.trim();
    const hasKeywords = queries.length > 0;
    const hasNotifications = !!p?.receiveMessages && (!!p?.isEmailVerified || !!p?.telegramChatId);
    const hasSubscription = !!p?.subscription && ['PRO', 'PREMIUM'].includes(p.subscription);

    return hasCv && hasName && hasKeywords && hasNotifications && hasSubscription;
  });

  async ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (token) {
      this.authService.setToken(token);
      await this.router.navigate(['/private/onboarding'], {
        queryParams: {},
        replaceUrl: true
      });
    }

    // now runs AFTER navigation settles
    this.isOnboardingRoute.set(this.router.url.includes('/onboarding'));
    this.hideFooterAndHeader.set(this.router.url.includes('/dashboard'));

    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((e: NavigationEnd) => {
        this.isOnChatRoute.set(e.urlAfterRedirects.includes('/dashboard'));
        this.isOnboardingRoute.set(e.urlAfterRedirects.includes('/onboarding'));
        this.hideFooterAndHeader.set(e.urlAfterRedirects.includes('/dashboard'));
        this.checkOnboardingGuard(e.urlAfterRedirects);
      });

    await this.getProfile();
    this.themeService.init();
    await this.getCv();
    this.checkOnboardingGuard(this.router.url);

    this.loadMatchedJobs(1);
    this.loadSentJobs();
  }

  checkOnboardingGuard(url: string) {
    if (!url || !url.startsWith('/private')) return;

    if (!this.isOnboardingCompleted()) {
      // Incomplete: redirect to onboarding
      if (!url.includes('/onboarding')) {
        this.router.navigate(['/private/onboarding'], { replaceUrl: true });
      }
    } else {
      // Completed: if user is on onboarding or base /private, send directly to dashboard!
      if (url === '/private' || url === '/private/' || url.includes('/onboarding')) {
        this.router.navigate(['/private/dashboard'], { replaceUrl: true });
      }
    }
  }

  loadMatchedJobs(page: number) {
    this.stateStore.loadAIMatchedJobs(page, 6);
  }

  loadSentJobs() {
    this.stateStore.loadSentJobs();
  }

  async getProfile() {
    await this.stateStore.loadProfile();
  }

  initials = computed(() => {
    const u = this.stateStore.profile();
    if (!u) return '';
    return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
  });

  getCv() {
    this.stateStore.getCv();
  }

  toggleSidebar() {
    this.isSidebarOpen.set(!this.isSidebarOpen());
  }

  closeSidebar() {
    this.isSidebarOpen.set(false);
  }

  logout() {
    this.authService.logOut().then(() => {
      this.router.navigate(['/home']);
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

  // ── Dashboard helpers ──────────────────────────────────────────
  createNewChat() {
    const newId = this.dashboardStore.createConversation();
    this.router.navigate(['/private/dashboard', newId]);
    this.closeSidebar();
  }

  selectConversation(id: string) {
    this.dashboardStore.setActiveConversation(id);
    this.router.navigate(['/private/dashboard', id]);
    this.closeSidebar();
  }

  deleteConversation(event: Event, id: string) {
    event.stopPropagation();
    this.dashboardStore.deleteConversation(id);
    // Navigate to another conversation or base chat
    const remaining = this.dashboardStore.conversations();
    if (remaining.length > 0) {
      this.router.navigate(['/private/dashboard', remaining[0].id]);
    } else {
      this.router.navigate(['/private/dashboard']);
    }
  }

  isActiveConversation(id: string): boolean {
    return this.dashboardStore.activeConversationId() === id;
  }

  formatConvTime(date: Date): string {
    const d = new Date(date);
    return new Intl.DateTimeFormat('ka-GE', { month: 'short', day: 'numeric' }).format(d);
  }
}

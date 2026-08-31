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

@Component({
  selector: 'app-private-layout',
  imports: [RouterModule, CommonModule],
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

  authService = inject(AuthService);
  stateStore = inject(StateStore);
  dashboardStore = inject(DashboardStore);
  dialog = inject(MatDialog);

  isOnChatRoute = signal<boolean>(this.router.url.includes('/dashboard'));
  isOnboardingCompleted = computed(() => this.stateStore.isOnboardingCompleted());
  isLayoutReady = signal<boolean>(this.stateStore.profileLoaded());
  isOnboardingRoute = computed(() => this.router.url.includes('/onboarding'));

  async ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (token) {
      this.authService.setToken(token);
      await this.stateStore.loadProfile(true);
      if (this.stateStore.isOnboardingCompleted() && this.stateStore.hasActiveSubscription()) {
        await this.router.navigate(['/private/dashboard'], {
          queryParams: {},
          replaceUrl: true
        });
      } else {
        await this.router.navigate(['/private/onboarding'], {
          queryParams: {},
          replaceUrl: true
        });
      }
    }

    this.hideFooterAndHeader.set(this.router.url.includes('/dashboard'));

    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((e: NavigationEnd) => {
        this.isOnChatRoute.set(e.urlAfterRedirects.includes('/dashboard'));
        this.hideFooterAndHeader.set(e.urlAfterRedirects.includes('/dashboard'));
        this.checkOnboardingGuard(e.urlAfterRedirects);
      });

    if (!this.stateStore.profileLoaded()) {
      await this.stateStore.loadProfile();
    }
    this.themeService.init();
    this.checkOnboardingGuard(this.router.url);
    this.isLayoutReady.set(true);

    if (this.stateStore.isOnboardingCompleted()) {
      this.loadMatchedJobs(1);
      this.loadSentJobs();
    }
  }


  checkOnboardingGuard(url: string) {
    if (!url || !url.startsWith('/private')) return;
    if (url.includes('/private/onboarding')) return;

    if (!this.stateStore.hasActiveSubscription() || !this.stateStore.isOnboardingCompleted()) {
      this.router.navigate(['/private/onboarding'], { replaceUrl: true });
      return;
    }

    if (url === '/private' || url === '/private/') {
      if (this.stateStore.isPro()) {
        this.router.navigate(['/private/dashboard'], { replaceUrl: true });
      } else {
        this.router.navigate(['/private/profile'], { replaceUrl: true });
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

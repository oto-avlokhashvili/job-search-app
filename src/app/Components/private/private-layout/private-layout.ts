import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal, DestroyRef } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { StateStore } from '../../../Store/state.store';
import { ChatStore } from '../../../Store/chat.store';
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



  navItems = signal([
    { icon: '🔥', label: 'Top ვაკანსიები', route: 'dashboard' },
    { icon: '🔔', label: 'შეტყობინებები', route: 'jobs' },
    { icon: '⚙️', label: 'პროფილი', route: 'profile' },
    { icon: '🤖', label: 'AI ასისტენტი', route: 'chat' },
  ]);

  authService = inject(AuthService);
  stateStore = inject(StateStore);
  chatStore = inject(ChatStore);
  dialog = inject(MatDialog);

  isOnChatRoute = signal<boolean>(this.router.url.includes('/chat'));

  async ngOnInit() {
  const token = this.route.snapshot.queryParamMap.get('token');

  if (token) {
    this.authService.setToken(token);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true
    });
  }

  // now runs AFTER navigation settles
  this.hideFooterAndHeader.set(this.router.url.includes('/chat'));
  this.router.events
    .pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    )
    .subscribe((e: NavigationEnd) => {
      this.isOnChatRoute.set(e.urlAfterRedirects.includes('/chat'));
      this.hideFooterAndHeader.set(e.urlAfterRedirects.includes('/chat'));
    });

  this.getProfile();
  this.themeService.init();
  this.getCv();
  this.loadMatchedJobs(1);
  this.loadSentJobs();
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
      this.router.navigate(['/auth']);
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

  // ── Chat helpers ──────────────────────────────────────────────
  createNewChat() {
    const newId = this.chatStore.createConversation();
    this.router.navigate(['/private/chat', newId]);
    this.closeSidebar();
  }

  selectConversation(id: string) {
    this.chatStore.setActiveConversation(id);
    this.router.navigate(['/private/chat', id]);
    this.closeSidebar();
  }

  deleteConversation(event: Event, id: string) {
    event.stopPropagation();
    this.chatStore.deleteConversation(id);
    // Navigate to another conversation or base chat
    const remaining = this.chatStore.conversations();
    if (remaining.length > 0) {
      this.router.navigate(['/private/chat', remaining[0].id]);
    } else {
      this.router.navigate(['/private/chat']);
    }
  }

  isActiveConversation(id: string): boolean {
    return this.chatStore.activeConversationId() === id;
  }

  formatConvTime(date: Date): string {
    const d = new Date(date);
    return new Intl.DateTimeFormat('ka-GE', { month: 'short', day: 'numeric' }).format(d);
  }
}

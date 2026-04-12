import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal, DestroyRef } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { StateStore } from '../../../Store/state.store';
import { ThemeService } from '../../../Core/Services/theme.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

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
  hideFooterAndHeader = signal<boolean>(true);
  destroyRef = inject(DestroyRef);
  route = inject(ActivatedRoute);
  navItems = signal([
    { icon: '📊', label: 'მთავარი', route: 'dashboard' },
    { icon: '🔍', label: 'ნაპოვნი ვაკანსიები', route: 'found-jobs' },
    { icon: '💼', label: 'ვაკანსიების ისტ.', route: 'jobs' },
    { icon: '🔔', label: 'აქტიური ვაკანსიები', route: 'all-jobs' },
    { icon: '⚙️', label: 'პროფილი', route: 'profile' },
    { icon: '🤖', label: 'AI ასისტენტი', route: 'chat' },
  ]);

  authService = inject(AuthService);
  stateStore = inject(StateStore);

  // Reactive signal that tracks whether we are on the /chat route
  isOnChatRoute = signal<boolean>(this.router.url.includes('/chat'));

  ngOnInit() {
    // Keep isOnChatRoute in sync on every navigation
    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((e: any) => {
        this.isOnChatRoute.set((e as NavigationEnd).urlAfterRedirects.includes('/chat'));
        let r = this.route.firstChild;
      while (r?.firstChild) r = r.firstChild;
      this.hideFooterAndHeader.set(r?.snapshot.data['hideFooterAndHeader'] ?? false);
      });

    this.getProfile();
    this.themeService.init();
    this.stateStore.loadAllJobs([], 1);
    this.getCv();
  }

  async getProfile() {
    await this.stateStore.loadProfile();
    this.stateStore.loadMatchedJobs(this.stateStore.profile().id);
    if (this.stateStore.profile().searchQuery?.length > 0) {
      this.stateStore.loadJobs(this.stateStore.profile().searchQuery);
    }
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

  // Chat helpers
  createNewConversation() {
    this.router.navigate(['/private/chat'], { queryParams: { reset: Date.now() } });
  }

  selectConversation() {
    this.router.navigate(['/private/chat']);
    this.closeSidebar();
  }

  deleteConversation(event: Event) {
    event.stopPropagation();
    // Logic to clear chat can be handled via a signal or event if needed, 
    // but for now we'll just navigate to the page and let it handle reset if needed.
    this.router.navigate(['/private/chat'], { queryParams: { clear: Date.now() } });
  }
}

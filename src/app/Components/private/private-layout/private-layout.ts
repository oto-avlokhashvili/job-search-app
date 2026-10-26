import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { ThemeService } from '../../../Core/Services/theme.service';
import { HrStore } from '../../../Store/hr.store';
import { StateStore } from '../../../Store/state.store';

// Shell for the HR area: its own sidebar instead of the public header/footer (route data hideLayout).
@Component({
  selector: 'app-private-layout',
  imports: [RouterModule],
  templateUrl: './private-layout.html',
  styleUrl: './private-layout.scss',
})
export class PrivateLayout {
  private router = inject(Router);
  private authService = inject(AuthService);
  themeService = inject(ThemeService);
  stateStore = inject(StateStore);
  private hrStore = inject(HrStore);

  isSidebarOpen = signal(false);
  isAdmin = computed(() => this.stateStore.profile().role === 'ADMIN');
  isApproved = computed(() => this.isAdmin() || !!this.stateStore.profile().hrApproved);
  usage = this.hrStore.usage;
  // Sidebar badges; shown once the lists are in the store (no extra requests for them).
  unlockedCount = computed(() => this.hrStore.unlocked().length);
  pendingCount = computed(() => this.hrStore.accounts().filter((a) => !a.hrApproved).length);

  constructor() {
    // Usage endpoints reject unapproved HR accounts, so load once access is granted.
    // Kept in HrStore: re-entering /hr doesn't refetch it.
    effect(() => {
      if (!this.isApproved()) return;
      this.hrStore.loadUsage();
      // Feed the sidebar badges; the pages reuse these lists without refetching.
      this.hrStore.loadUnlocked();
      if (this.isAdmin()) this.hrStore.loadAccounts().catch(() => {});
    });
  }

  percent({ used, limit }: { used: number; limit: number }): number {
    return limit ? Math.min(100, (used / limit) * 100) : 0;
  }
  initials = computed(() => {
    const u = this.stateStore.profile();
    return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
  });

  toggleSidebar() {
    this.isSidebarOpen.update((open) => !open);
  }

  closeSidebar() {
    this.isSidebarOpen.set(false);
  }

  logout() {
    this.authService.logOut().then(() => this.router.navigate(['/vacancies']));
  }
}

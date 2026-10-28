import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../../Core/Services/auth-service';
import { ThemeService } from '../../../Core/Services/theme.service';
import { HrStore } from '../../../Store/hr.store';
import { StateStore } from '../../../Store/state.store';
import { HrVacancy } from '../../../Core/Interfaces/hr';
import { HrVacancyDialog } from '../hr-vacancy-dialog/hr-vacancy-dialog';

// Shell for the HR area: its own sidebar instead of the public header/footer (route data hideLayout).
@Component({
  selector: 'app-private-layout',
  imports: [RouterModule, HrVacancyDialog],
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
  // Pages with route data wideContent (the candidates board) use the full width instead of the centered column.
  isWide = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.readWide()),
    ),
    { initialValue: this.readWide() },
  );
  isAdmin = computed(() => this.stateStore.profile().role === 'ADMIN');
  isApproved = computed(() => this.isAdmin() || !!this.stateStore.profile().hrApproved);
  usage = this.hrStore.usage;
  // Sidebar badges; shown once the lists are in the store (no extra requests for them).
  // Distinct CVs: a candidate in two vacancies counts once.
  candidateCount = computed(() => new Set(this.hrStore.board().map((c) => c.id)).size);
  pendingCount = computed(() => this.hrStore.accounts().filter((a) => !a.hrApproved).length);

  openVacancies = computed(() => this.hrStore.vacancies().filter((v) => v.status === 'OPEN'));
  closedVacancies = computed(() => this.hrStore.vacancies().filter((v) => v.status === 'CLOSED'));
  showClosed = signal(false);
  // Interviews: answers waiting for the HR (badge in amber), otherwise how many are coming up
  private aheadInterviews = computed(() => this.hrStore.interviews().filter((i) => new Date(i.startsAt).getTime() > Date.now()));
  interviewsNeedingAnswer = computed(() => this.aheadInterviews().filter((i) => i.status === 'RESCHEDULE_REQUESTED').length);
  upcomingInterviews = computed(() => this.aheadInterviews().filter((i) => i.status === 'PENDING' || i.status === 'CONFIRMED').length);
  creatingVacancy = signal(false);
  // Live counts from the board once it's loaded (moves and adds update them); the server's until then
  private cardsPerVacancy = computed(() => {
    const counts = new Map<number, number>();
    for (const c of this.hrStore.board()) {
      if (c.pipeline.vacancyId !== null) counts.set(c.pipeline.vacancyId, (counts.get(c.pipeline.vacancyId) ?? 0) + 1);
    }
    return counts;
  });

  constructor() {
    // Usage endpoints reject unapproved HR accounts, so load once access is granted.
    // Kept in HrStore: re-entering /hr doesn't refetch it.
    effect(() => {
      if (!this.isApproved()) return;
      const isAdmin = this.isAdmin();
      // The loaders read store flags; untracked so a failed load doesn't re-run this effect in a loop
      untracked(() => {
        this.hrStore.loadUsage();
        // Feed the sidebar badges; the pages reuse these lists without refetching.
        this.hrStore.loadBoard();
        this.hrStore.loadVacancies();
        this.hrStore.loadInterviews();
        if (isAdmin) this.hrStore.loadAccounts().catch(() => {});
      });
    });
  }

  vacancyCount(vacancy: HrVacancy): number {
    return this.hrStore.boardLoaded() ? (this.cardsPerVacancy().get(vacancy.id) ?? 0) : vacancy.total;
  }

  onVacancyCreated(vacancy: HrVacancy) {
    this.creatingVacancy.set(false);
    this.closeSidebar();
    this.router.navigate(['/hr/candidates/v', vacancy.id]);
  }

  // From the router state snapshot: while this layout is being created, child ActivatedRoutes
  // don't have their snapshot yet.
  private readWide(): boolean {
    let r: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    while (r?.firstChild) r = r.firstChild;
    return !!r?.data?.['wideContent'];
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

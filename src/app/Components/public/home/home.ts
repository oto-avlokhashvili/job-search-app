import { afterNextRender, Component, computed, DestroyRef, ElementRef, HostListener, inject, OnInit, PLATFORM_ID, QueryList, signal, ViewChild, ViewChildren } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PublicCvModal } from '../public-cv-modal/public-cv-modal';
import { CompanyLogos } from '../../../Core/Utils/company-logos';
import { JOB_CATEGORIES } from '../../../Core/Utils/job-categories';
import { extractSalary, hasSalary } from '../../../Core/Utils/salary-extractor';
import { parseJobDate } from '../../../Core/Utils/date-parse';
import { Job } from '../../../Core/Interfaces/jobs';

/** "დღეს", "გუშინ", "3 დღის წინ" … for the preview rows */
function relativeDay(value: unknown): string {
  const date = parseJobDate(value);
  if (!date) return '';
  const now = new Date();
  const days = Math.round(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) / 86_400_000,
  );
  if (days <= 0) return 'დღეს';
  if (days === 1) return 'გუშინ';
  if (days < 7) return `${days} დღის წინ`;
  return `${Math.floor(days / 7)} კვირის წინ`;
}
import { AuthService } from '../../../Core/Services/auth-service';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { JOBUP_LOGO, StateStore } from '../../../Store/state.store';
import { MatDialog } from '@angular/material/dialog';
import { JobsService } from '../../../Core/Services/jobs-service';
import { SeoService } from '../../../Core/Services/seo.service';
import { JobLink } from '../../../Core/Directives/job-link.directive';
import { CvSearchService } from '../../../Core/Services/cv-search.service';
import { LANDING_PAGES } from '../../../Core/Utils/landing-pages';
import { AiSearchSteps } from '../../shared/ai-search-steps/ai-search-steps';
import { toVacancyItem, VacancyCard } from '../../shared/vacancy-card/vacancy-card';
import { VacancyItem } from '../../../Core/Interfaces/jobs';
import { VACANCY_TOTAL } from '../../../Core/Constants/vacancy-total';
import { HomeResetService } from '../../../Core/Services/home-reset.service';
import { SiteModalsService } from '../../../Core/Services/site-modals.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

/** A row of chips that scrolls sideways, with arrows: knows whether each end can still scroll */
class ScrollRow {
  canLeft = signal(false);
  canRight = signal(false);
  scrollable = computed(() => this.canLeft() || this.canRight());
  private el?: HTMLElement;
  private resizeObserver?: ResizeObserver;

  attach(el: HTMLElement | undefined) {
    this.resizeObserver?.disconnect();
    this.el = el;
    if (!el || typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => this.update());
    this.resizeObserver.observe(el);
  }

  update() {
    const el = this.el;
    if (!el) return;
    // 2px tolerance for sub-pixel scroll positions
    this.canLeft.set(el.scrollLeft > 2);
    this.canRight.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }

  scroll(direction: 1 | -1) {
    this.el?.scrollBy({ left: direction * this.el.clientWidth * 0.7, behavior: 'smooth' });
  }

  destroy() {
    this.resizeObserver?.disconnect();
  }
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [JobLink, RouterModule, CommonModule, ReactiveFormsModule, AiSearchSteps, VacancyCard],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  authService = inject(AuthService);
  stateStore = inject(StateStore);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private alertify = inject(AlertifyService);
  private jobsService = inject(JobsService);
  private seo = inject(SeoService);

  stats = this.stateStore.stats;
  statsLoading = this.stateStore.statsLoading;
  dbTotalRecords = this.stateStore.publicDbTotal;

  // ── Hero (job seekers; employers have their own page, /employers) ──
  /** Never the exact number: "10,000+" (see vacancy-total.ts) */
  readonly vacancyTotal = VACANCY_TOTAL;

  // ── The footer in the hero's corners ──
  /** Pricing and contact open as dialogs */
  modals = inject(SiteModalsService);
  readonly year = new Date().getFullYear();

  searchQuery = new FormControl('', { nonNullable: true });
  /** Phones: the CV button leaves the input too narrow for the example, so a short question instead */
  searchPlaceholder = signal('მაგ. ბუღალტერი ბათუმში');
  /** Every category, as one scrollable row of chips */
  readonly heroCategories = JOB_CATEGORIES;

  // Chip rows (categories, frequently searched): arrows shown only when the row overflows, each end
  // disabled when reached
  readonly quickRow = new ScrollRow();
  readonly popularRow = new ScrollRow();
  @ViewChild('quickTrack') set quickTrack(ref: ElementRef<HTMLElement> | undefined) {
    this.quickRow.attach(ref?.nativeElement);
  }
  /** The copy inside the phone (phones) */
  readonly popularPhoneRow = new ScrollRow();
  @ViewChildren('popularTrack') set popularTracks(refs: QueryList<ElementRef<HTMLElement>>) {
    const els = refs.map((ref) => ref.nativeElement);
    this.popularRow.attach(els.find((el) => !el.closest('.phone')));
    this.popularPhoneRow.attach(els.find((el) => !!el.closest('.phone')));
  }

  readonly logos = new CompanyLogos();
  /** The newest vacancies, shown in the seeker preview */
  latestLoading = signal(true);
  latestJobs = signal<{ id: number; title: string; company: string; location: string; logo: string | null; salary: string; age: string }[]>([]);
  /** The stage: the phone's highlighted vacancy, the card beside the phone, then the phone's list */
  featuredJob = computed(() => this.latestJobs()[0] ?? null);
  sideJob = computed(() => this.latestJobs()[1] ?? null);
  phoneJobs = computed(() => this.latestJobs().slice(2, 5));
  readonly jobUpLogo = JOBUP_LOGO;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.quickRow.destroy();
      this.popularRow.destroy();
      this.popularPhoneRow.destroy();
      this.moreObserver?.disconnect();
    });
    inject(HomeResetService).resets.pipe(takeUntilDestroyed()).subscribe(() => this.resetSearch());
    afterNextRender(() => {
      if (window.matchMedia('(max-width: 991px)').matches) this.searchPlaceholder.set('რას ეძებ?');
      this.fitHeroToScreen();
      // Once more when the web fonts are in: they change the title's height
      void document.fonts?.ready.then(() => {
        this.fitHeroToScreen();
        this.quickRow.update();
        this.popularRow.update();
        this.popularPhoneRow.update();
      });
    });
  }

  // ── Search in the hero: the phone makes way for the results ──
  // Home is the search: keyword or sentence, CV, and the filters below the bar. The search lives in the
  // URL (?search, category, location, salary, mode=cv), so a reload or a shared link shows it again.
  private cvSearch = inject(CvSearchService);
  private route = inject(ActivatedRoute);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** null = no search yet (the phone shows); otherwise which search the results are from */
  resultsMode = signal<'keyword' | 'cv' | null>(null);
  resultsLoading = signal(false);
  /** "Show more" is fetching the next page */
  loadingMore = signal(false);
  results = signal<{ item: VacancyItem; match: number | null }[]>([]);
  resultsTotal = signal(0);
  resultsError = signal('');
  /** The CV is gone from the database: the error offers a new upload */
  cvMissing = signal(false);
  resultsQuery = signal('');
  /** What the AI read from a sentence ("ბუღალტერი · ბათუმი"); null for keyword searches */
  aiSummary = signal<string | null>(null);
  cvProfile = signal<{ detectedRole: string; seniorityLevel: string } | null>(null);
  /** Every CV match; `results` shows the first ones, "show more" the rest */
  private cvMatches: { item: VacancyItem; match: number | null }[] = [];
  /** Per page; a search shows at most 60 (the API's limit) */
  readonly pageSize = 12;
  private page = 1;
  /** The AI steps stay at least this long, so they can be read even when results are instant */
  private readonly minSearchMs = 2400;
  /** A newer search wins over one still running */
  private searchRun = 0;

  // Filters: they narrow the keyword search, and are a search on their own ("IT in Batumi")
  category = signal('all');
  city = signal('all');
  salaryOnly = signal(false);
  readonly cities = LANDING_PAGES.filter((p) => p.kind === 'city').map((p) => p.filter.location!);
  hasFilters = computed(() => this.category() !== 'all' || this.city() !== 'all' || this.salaryOnly());
  /** A keyword search shows at most 60 (the API's limit), whatever the count says */
  hasMore = computed(() => this.results().length < Math.min(this.resultsTotal(), this.resultsMode() === 'keyword' ? 60 : Infinity));
  /** The last automatic "load more" failed: a retry button instead of loading again and again */
  loadMoreFailed = signal(false);

  // ── Frequently searched: chips under the search bar ──
  /** Until the API has enough real searches (and when it's down), these fill the row */
  private readonly fallbackPopular = ['ბუღალტერი', 'გაყიდვების მენეჯერი', 'მძღოლი', 'ოპერატორი', 'დეველოპერი', 'მიმტანი', 'ფარმაცევტი', 'დისტანციური'];
  popularSearches = signal<string[]>(this.fallbackPopular);

  private async loadPopularSearches() {
    try {
      const { queries } = await firstValueFrom(this.jobsService.getPopularSearches(10));
      const seen = new Set<string>();
      const merged = [...(queries || []), ...this.fallbackPopular].filter((q) => {
        const key = q.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      this.popularSearches.set(merged.slice(0, 10));
      // New chips, new width: the arrows once they've rendered
      if (this.isBrowser) setTimeout(() => {
        this.popularRow.update();
        this.popularPhoneRow.update();
      });
    } catch {
      // The fallback list stays
    }
  }

  searchPopular(term: string) {
    this.searchQuery.setValue(term);
    this.runSearch();
  }

  // ── Infinite scroll: a sentinel under the results loads the next page when it comes into view ──
  private moreObserver?: IntersectionObserver;
  private sentinelVisible = false;
  @ViewChild('moreSentinel') set moreSentinel(ref: ElementRef<HTMLElement> | undefined) {
    this.moreObserver?.disconnect();
    this.sentinelVisible = false;
    const el = ref?.nativeElement;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // Desktop: the results scroll inside the phone; phones: in the page
    const body = el.closest<HTMLElement>('.screen-body');
    const scrolls = body && /(auto|scroll)/.test(getComputedStyle(body).overflowY);
    this.moreObserver = new IntersectionObserver(
      ([entry]) => {
        this.sentinelVisible = entry.isIntersecting;
        if (entry.isIntersecting) void this.autoLoadMore();
      },
      { root: scrolls ? body : null, rootMargin: '0px 0px 240px 0px' },
    );
    this.moreObserver.observe(el);
  }

  /** The next page, then another while the sentinel is still in view (a tall screen, a short page) */
  private async autoLoadMore() {
    if (this.loadingMore() || this.loadMoreFailed() || !this.hasMore()) return;
    await this.showMore();
    if (this.sentinelVisible && this.hasMore() && !this.loadMoreFailed()) {
      // After the new cards have rendered
      setTimeout(() => this.sentinelVisible && void this.autoLoadMore(), 50);
    }
  }

  retryLoadMore() {
    this.loadMoreFailed.set(false);
    void this.autoLoadMore();
  }
  /**
   * The card in the results grid: 'promo' (upload your CV and HR finds you) for a keyword search by
   * someone without a CV here; 'uploaded' (your CV is in the candidate pool) for those who have one.
   */
  cvCard = computed<'promo' | 'uploaded' | null>(() => {
    if (!this.resultsMode() || this.resultsLoading() || this.resultsError()) return null;
    if (this.cvSearch.hasCv()) return 'uploaded';
    return this.resultsMode() === 'keyword' ? 'promo' : null;
  });
  /** It takes the third place in the grid */
  readonly cvCardSlot = 2;
  cvFileName = this.cvSearch.cvFileName;

  search(event: Event) {
    event.preventDefault();
    this.runSearch();
  }

  /** The search bar and the filters together; nothing to search for = back to the phone */
  runSearch() {
    const query = this.searchQuery.value.trim();
    if (!query && !this.hasFilters()) {
      if (this.resultsMode()) this.clearResults();
      else this.alertify.warning('ჩაწერე პოზიცია ან რას ეძებ, მაგ. „მინდა ბუღალტრად ვიმუშაო ბათუმში“');
      return;
    }
    void this.runKeywordSearch(query);
  }

  toggleCategory(key: string) {
    this.category.set(this.category() === key ? 'all' : key);
    this.runSearch();
  }

  setCity(value: string) {
    this.city.set(value || 'all');
    this.runSearch();
  }

  // The city menu. The filters are drawn twice: under the search bar (desktop) and inside the phone
  // (mobile); CSS shows one of them.
  cityMenuOpen = signal(false);
  private host = inject(ElementRef<HTMLElement>);

  toggleCityMenu() {
    this.cityMenuOpen.update((open) => !open);
  }

  pickCity(value: string) {
    this.cityMenuOpen.set(false);
    if (value !== this.city()) this.setCity(value);
  }

  /** Esc gives the focus back to the pill, so the keyboard user stays where they were */
  closeCityMenu(refocus = false) {
    if (!this.cityMenuOpen()) return;
    this.cityMenuOpen.set(false);
    if (refocus) this.visibleCityButton()?.focus();
  }

  /** The city pill that's on screen (the other copy of the filters is display: none) */
  private visibleCityButton(): HTMLButtonElement | undefined {
    const buttons = this.host.nativeElement.querySelectorAll('.city-trigger') as NodeListOf<HTMLButtonElement>;
    return Array.from(buttons).find((b) => b.getClientRects().length > 0);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeCityMenu(true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.cityMenuOpen()) return;
    const pickers = Array.from(this.host.nativeElement.querySelectorAll('.city-picker')) as HTMLElement[];
    if (!pickers.some((picker) => picker.contains(event.target as Node))) this.cityMenuOpen.set(false);
  }

  toggleSalaryOnly() {
    this.salaryOnly.update((v) => !v);
    this.runSearch();
  }

  clearFilters() {
    this.category.set('all');
    this.city.set('all');
    this.salaryOnly.set(false);
    this.runSearch();
  }

  /** CV search: the saved CV, or the upload modal first when there is none */
  async searchWithCv() {
    this.cvSearch.loadUploadedCv();
    if (!this.cvSearch.hasCv()) {
      if (await this.cvSearch.openUploadModal({ searchAfterUpload: true })) void this.runCvSearch();
      return;
    }
    void this.runCvSearch();
  }

  /** A new CV after "the CV is gone" */
  async reuploadCv() {
    if (await this.cvSearch.openUploadModal({ reupload: true, searchAfterUpload: true })) void this.runCvSearch();
  }

  /** The Job Up logo: no query, no filters, no results; the phone is back */
  private resetSearch() {
    this.searchQuery.setValue('');
    this.category.set('all');
    this.city.set('all');
    this.salaryOnly.set(false);
    this.cityMenuOpen.set(false);
    this.clearResults();
  }

  /** Back to the phone */
  clearResults() {
    this.searchRun++;
    this.resultsMode.set(null);
    this.resultsLoading.set(false);
    this.results.set([]);
    this.syncUrl(null);
  }

  /** The next results: another page from the API, or more of the CV matches already here */
  async showMore() {
    if (this.resultsMode() === 'cv') {
      this.results.set(this.cvMatches.slice(0, this.results().length + this.pageSize));
      return;
    }
    if (this.loadingMore()) return;
    const run = this.searchRun;
    this.loadingMore.set(true);
    try {
      const res = await firstValueFrom(this.jobsService.search(this.searchParams(this.resultsQuery(), this.page + 1)));
      if (run !== this.searchRun) return;
      this.page++;
      this.results.update((list) => [...list, ...(res.jobs || []).map((job) => ({ item: toVacancyItem(job), match: null }))]);
      // An empty page: nothing more to show, whatever the count said
      if (!res.jobs?.length) this.resultsTotal.set(this.results().length);
    } catch {
      if (run === this.searchRun) this.loadMoreFailed.set(true);
    } finally {
      this.loadingMore.set(false);
    }
  }

  /** "All vacancies" on the phone: there is no list to open, so the search it is */
  focusSearch(event?: Event) {
    event?.preventDefault();
    const input = document.querySelector<HTMLInputElement>('.hero-search input');
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => input?.focus({ preventScroll: true }), 350);
  }

  private searchParams(query: string, page: number) {
    return {
      query,
      page,
      limit: this.pageSize,
      category: this.category(),
      location: this.city(),
      salaryOnly: this.salaryOnly(),
    };
  }

  private async runKeywordSearch(query: string) {
    const run = this.startResults('keyword');
    this.resultsQuery.set(query);
    this.page = 1;
    this.syncUrl('keyword');
    try {
      const [res] = await Promise.all([
        firstValueFrom(this.jobsService.search(this.searchParams(query, 1))),
        this.minDelay(),
      ]);
      if (run !== this.searchRun) return;
      this.results.set((res.jobs || []).map((job) => ({ item: toVacancyItem(job), match: null })));
      this.resultsTotal.set(res.counts?.filteredRecords || 0);
      const ai = res.interpreted;
      this.aiSummary.set(ai ? [ai.keywords, ai.city].filter(Boolean).join(' · ') || 'შენი მოთხოვნით' : null);
    } catch (err: any) {
      if (run !== this.searchRun) return;
      this.resultsError.set(
        err?.status === 429 ? 'ძალიან ბევრი ძიებაა, სცადე ცოტა ხანში' : 'ძიება ვერ მოხერხდა, სცადე თავიდან',
      );
    } finally {
      if (run === this.searchRun) this.resultsLoading.set(false);
    }
  }

  private async runCvSearch() {
    const run = this.startResults('cv');
    this.syncUrl('cv');
    try {
      const [res] = await Promise.all([this.cvSearch.search(), this.minDelay()]);
      if (run !== this.searchRun) return;
      this.cvProfile.set(res.profile);
      this.cvMatches = res.jobs.map((job) => ({ item: toVacancyItem(job), match: job.match ?? null }));
      this.results.set(this.cvMatches.slice(0, this.pageSize));
      this.resultsTotal.set(this.cvMatches.length);
    } catch (err: any) {
      if (run !== this.searchRun) return;
      const message = this.cvSearch.errorMessage(err);
      this.cvMissing.set(!message);
      this.resultsError.set(message || 'შენახული CV ვეღარ მოიძებნა, ატვირთე ხელახლა');
    } finally {
      if (run === this.searchRun) this.resultsLoading.set(false);
    }
  }

  /** The room the searched phone has: from under the search controls to the bottom of the window (460–900px) */
  searchPhoneHeight = signal(640);
  @ViewChild('heroStage') private heroStage?: ElementRef<HTMLElement>;

  /**
   * The stage sits at the bottom of the hero (a screen tall), so it can grow up to the search controls
   * above it. Measured from what's above (it doesn't move) and from the top of the page, so it's the
   * same wherever the visitor has scrolled to. 56px = the stage's top margin, 16px = its extra height.
   */
  private fitPhoneToScreen() {
    const stage = this.heroStage?.nativeElement;
    const above = stage?.previousElementSibling;
    if (!stage || !above || typeof window === 'undefined') return;
    // Rects are on screen (zoomed); the phone's height is in the stage's own pixels
    const zoom = this.heroZoom() * (parseFloat(getComputedStyle(stage).zoom) || 1);
    const aboveBottom = above.getBoundingClientRect().bottom + window.scrollY;
    const section = getComputedStyle(this.heroSection!.nativeElement);
    // The stage's top margin and the footer's strip (home.scss --foot-h), on screen
    const gaps = (parseFloat(getComputedStyle(stage).marginTop) + (parseFloat(section.getPropertyValue('--foot-h')) || 0)) * this.heroZoom();
    const room = (window.innerHeight - aboveBottom - gaps) / zoom;
    this.searchPhoneHeight.set(Math.round(Math.min(900, Math.max(460, room))));
  }

  /**
   * Short laptop screens: the scale at which the whole hero fits the window, title to footer, with
   * the side cards in full (the phone may run off the bottom, as it does anyway). Never below 0.6.
   * Phones scroll as usual.
   */
  heroZoom = signal(1);
  @ViewChild('heroSection') private heroSection?: ElementRef<HTMLElement>;

  private fitHeroToScreen() {
    const section = this.heroSection?.nativeElement;
    const stage = this.heroStage?.nativeElement;
    const copy = section?.querySelector('.hero-copy');
    if (!section || !stage || !copy || typeof window === 'undefined') return;
    if (window.innerWidth < 992) {
      this.heroZoom.set(1);
      return;
    }
    const zoom = this.heroZoom();
    const styles = getComputedStyle(section);
    const stageStyles = getComputedStyle(stage);
    const stageTop = stage.getBoundingClientRect().top;
    // How far down the side cards reach in the stage (on screen, so divided back to the hero's own px)
    const cardsBottom = Math.max(...Array.from(stage.querySelectorAll('.float-card')).map((c) => c.getBoundingClientRect().bottom));
    const cards = Number.isFinite(cardsBottom) ? (cardsBottom - stageTop) / zoom : 520;
    const header = 72;
    // Everything under the header, in the hero's own px (padding-top minus the header's share)
    const natural =
      parseFloat(styles.paddingTop) - header / zoom +
      copy.getBoundingClientRect().height / zoom +
      parseFloat(stageStyles.marginTop) +
      cards + 16 +
      (parseFloat(styles.getPropertyValue('--foot-h')) || 0);
    const fit = (window.innerHeight - header) / natural;
    this.heroZoom.set(Math.round(Math.min(1, Math.max(0.6, fit)) * 1000) / 1000);
  }

  @HostListener('window:resize')
  onResize() {
    this.fitHeroToScreen();
    if (this.resultsMode()) this.fitPhoneToScreen();
  }

  private startResults(mode: 'keyword' | 'cv'): number {
    this.fitPhoneToScreen();
    this.resultsMode.set(mode);
    this.resultsLoading.set(true);
    this.results.set([]);
    this.resultsTotal.set(0);
    this.resultsError.set('');
    this.loadMoreFailed.set(false);
    this.cvMissing.set(false);
    this.aiSummary.set(null);
    this.cvProfile.set(null);
    return ++this.searchRun;
  }

  /** The search in the address bar (replacing the entry: a filter click isn't a step to go Back to) */
  private syncUrl(mode: 'keyword' | 'cv' | null) {
    const keyword = mode === 'keyword';
    void this.router.navigate([], {
      queryParams: {
        search: keyword && this.resultsQuery() ? this.resultsQuery() : null,
        category: keyword && this.category() !== 'all' ? this.category() : null,
        location: keyword && this.city() !== 'all' ? this.city() : null,
        salary: keyword && this.salaryOnly() ? '1' : null,
        mode: mode === 'cv' ? 'cv' : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
      scroll: 'manual',
    });
  }

  /** A search in the link (a shared search, a keyword page's "search with filters", the old vacancies page) */
  private restoreSearchFromUrl() {
    const params = this.route.snapshot.queryParamMap;
    if (params.get('mode') === 'cv') {
      void this.searchWithCv();
      return;
    }
    const category = params.get('category');
    if (category && this.heroCategories.some((c) => c.key === category)) this.category.set(category);
    this.city.set(params.get('location') || 'all');
    this.salaryOnly.set(params.get('salary') === '1' || params.get('salary') === 'true');
    this.searchQuery.setValue(params.get('search') ?? '');
    if (this.searchQuery.value.trim() || this.hasFilters()) void this.runKeywordSearch(this.searchQuery.value.trim());
  }

  private minDelay() {
    return new Promise((resolve) => setTimeout(resolve, this.minSearchMs));
  }

  /**
   * Hot vacancies for the hero stage: the newest in Tbilisi that state a salary, from the same search
   * visitors use (Job Up has no company pages to feature companies from).
   */
  private async loadLatestJobs() {
    try {
      const res = await firstValueFrom(
        this.jobsService.search({ location: 'თბილისი', salaryOnly: true, limit: 5 }),
      );
      const jobs: Job[] = res.jobs || [];
      this.latestJobs.set(
        jobs.map((job) => {
          const salary = extractSalary(job);
          return {
            id: job.id,
            title: job.vacancy,
            company: job.company,
            location: (job.location || '').replace(/,?\s*(georgia|საქართველო)\s*$/i, '').trim() || job.location,
            logo: job.companyLogo ?? null,
            salary: hasSalary(salary) ? salary : '',
            age: relativeDay(job.publishDate),
          };
        }),
      );
    } catch {
      // The preview stays empty; the rest of the hero works without it
    } finally {
      this.latestLoading.set(false);
    }
  }

  /** The AI agent card: the same notification setup as the AI agent banner */
  async openAiAgent() {
    const { openNotificationChannelsModal } = await import('../notification-channels-modal/notification-channels-modal');
    openNotificationChannelsModal(this.dialog);
  }

  openPublicCvModal() {
    this.dialog
      .open(PublicCvModal, {
        width: '520px',
        maxWidth: '95vw',
        panelClass: 'public-cv-dialog',
        autoFocus: false,
      })
      // An upload puts the visitor in the pool: the promo goes
      .afterClosed()
      .subscribe(() => this.cvSearch.loadUploadedCv());
  }

  ngOnInit() {
    this.seo.update({
      title: 'ვაკანსიები — სამსახურის ძებნის ჭკვიანი გზა | Job Up',
      description: 'ეძებ სამსახურს? Job Up აერთიანებს საქართველოს ყველა ვაკანსიას ერთ სივრცეში. ატვირთე CV ან დაწერე რას ეძებ — AI იპოვის საუკეთესო ვარიანტებს.',
      path: '/home',
    });
    this.loadLatestJobs();
    void this.loadPopularSearches();
    // Results are for visitors, not for the server render
    if (this.isBrowser) {
      this.cvSearch.loadUploadedCv();
      this.restoreSearchFromUrl();
    }
  }

  scroll(target: string) {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

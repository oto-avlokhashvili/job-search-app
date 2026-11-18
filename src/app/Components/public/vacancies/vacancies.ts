import { CompanyLogos } from '../../../Core/Utils/company-logos';
import { Component, ElementRef, inject, Injector, OnInit, signal, computed, effect, ViewChild, AfterViewInit, OnDestroy, NgZone, HostListener, afterNextRender, untracked } from '@angular/core';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { StateStore, detectJobSource, formatJobDate, JOBUP_LOGO, JOBUP_SOURCE } from '../../../Store/state.store';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { CvSearchService } from '../../../Core/Services/cv-search.service';
import { debounceTime, distinctUntilChanged, filter, firstValueFrom, map } from 'rxjs';
import { PublicCvSearchResult } from '../../../Core/Services/cv';
import { JobsService } from '../../../Core/Services/jobs-service';
import { extractSalary, hasSalary } from '../../../Core/Utils/salary-extractor';
import { SeoService } from '../../../Core/Services/seo.service';
import { FavoriteButton } from '../../shared/favorite-button/favorite-button';
import { findJobCategory, JOB_CATEGORIES } from '../../../Core/Utils/job-categories';
import { JobLink } from '../../../Core/Directives/job-link.directive';
import { AiSearchSteps } from '../../shared/ai-search-steps/ai-search-steps';
import { VacancyCard } from '../../shared/vacancy-card/vacancy-card';
import { getLandingPage } from '../../../Core/Utils/landing-pages';
import { VACANCY_TOTAL } from '../../../Core/Constants/vacancy-total';

export interface VacancyItem {
  id: number;
  vacancy: string;
  company: string;
  location: string;
  source: string;
  salaryRange?: string;
  publishDate: string;
  deadline?: string;
  matchScore: number;
  link: string;
  companyLogo?: string | null;
  companyKey?: string | null;
}

@Component({
  selector: 'app-vacancies',
  standalone: true,
  imports: [JobLink, AiSearchSteps, VacancyCard, RouterModule, CommonModule, ReactiveFormsModule, MatTooltipModule, FavoriteButton],
  templateUrl: './vacancies.html',
  styleUrl: './vacancies.scss',
})
export class Vacancies implements OnInit, AfterViewInit, OnDestroy {
  authService = inject(AuthService);
  stateStore = inject(StateStore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private jobsService = inject(JobsService);
  private ngZone = inject(NgZone);
  private injector = inject(Injector);
  private alertify = inject(AlertifyService);
  private seo = inject(SeoService);
  private dialog = inject(MatDialog);

  @ViewChild('particleCanvas') particleCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('searchContainer') searchContainerRef!: ElementRef;
  @ViewChild('vacanciesSection') vacanciesSectionRef!: ElementRef;
  @ViewChild('filtersArea') filtersAreaRef!: ElementRef<HTMLElement>;
  @ViewChild('sourceChips') sourceChipsRef?: ElementRef<HTMLElement>;

  private animationFrameId: number | null = null;
  private isInitialLoad = true;
  searchState: 'idle' | 'searching' | 'burst' = 'idle';
  isLoading = this.stateStore.publicJobsLoading;
  isAppending = this.stateStore.publicJobsAppending;

  get currentPage(): number {
    return this.stateStore.publicJobsPage();
  }
  totalRecords = this.stateStore.publicJobsTotal;
  dbTotalRecords = this.stateStore.publicDbTotal;
  /** The header says "10,000+", never the exact number (see vacancy-total.ts) */
  readonly vacancyTotal = VACANCY_TOTAL;
  hasMoreJobs = this.stateStore.publicHasMore;

  // Filter Form Controls
  searchFilter = new FormControl<string>('', { nonNullable: true });
  locationFilter = new FormControl<string>('all', { nonNullable: true });
  locationSearchInput = new FormControl<string>('', { nonNullable: true });
  locationSearch = signal<string>('');
  // The portal filter left the search row (category replaced it); old links like ?source=hr.ge still work
  sourceFilter = new FormControl<string>('all', { nonNullable: true });
  categoryFilter = new FormControl<string>('all', { nonNullable: true });
  dateRangeFilter = new FormControl<string>('all', { nonNullable: true });
  // Only vacancies that state an amount (?salary=1)
  salaryOnly = signal(false);
  readonly hasSalary = hasSalary;

  readonly categories = JOB_CATEGORIES;
  /** Jobs per category, for the dropdown; empty until loaded (the filter works without it) */
  private categoryCounts = signal<Record<string, number>>({});
  categoryOptions = computed(() => {
    const counts = this.categoryCounts();
    return this.categories.map((c) => ({ ...c, count: counts[c.key] ?? 0 }));
  });

  isCategoryOpen = signal<boolean>(false);
  isLocationOpen = signal<boolean>(false);
  isDateRangeOpen = signal<boolean>(false);
  showScrollToFilters = signal<boolean>(false);
  // Arrows on the mobile source chip row; the right one shows by default so the server
  // render already hints that the row scrolls.
  chipsCanScrollLeft = signal(false);
  chipsCanScrollRight = signal(true);

  // "Popular" row under the filters. Categories filter the list in place; popular searches open
  // their keyword page (/vacancies/tbilisi, ...), the pages search engines index.
  readonly popularCategories = ['it', 'sales', 'finance', 'medicine', 'hospitality']
    .map((key) => findJobCategory(key)!)
    .filter(Boolean);

  /** The searches people make most, each with its own keyword page */
  readonly popularSearches = ['tbilisi', 'batumi', 'kutaisi', 'tbilisi-it', 'tbilisi-sales', 'batumi-sales', 'remote', 'part-time', 'internship', 'abroad']
    .map((slug) => getLandingPage(slug)!)
    .filter(Boolean)
    .map((page) => ({ slug: page.slug, label: page.h1, icon: page.kind === 'city' ? 'location_on' : 'search' }));

  /** Bottom of the list: scrolling near it loads the next page (see setupInfiniteScroll). */
  @ViewChild('loadMoreSentinel') set loadMoreSentinel(ref: ElementRef<HTMLElement> | undefined) {
    this.sentinelEl = ref?.nativeElement;
    this.observeSentinel();
  }
  private sentinelEl?: HTMLElement;
  private infiniteObserver?: IntersectionObserver;
  @ViewChild('popularTrack') popularTrackRef?: ElementRef<HTMLElement>;
  popularCanScrollLeft = signal(false);
  popularCanScrollRight = signal(false);
  // The popular row is hidden in CV mode and moves into the mobile filter modal; re-measure on any size change.
  private popularResizeObserver?: ResizeObserver;

  private favicon(domain: string) {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  }
  isFilterModalOpen = signal<boolean>(false);
  // The CV to search with: this browser's upload, else the account's (shared with the home hero)
  private cvSearch = inject(CvSearchService);
  uploadedCv = this.cvSearch.uploadedCv;
  accountCv = this.cvSearch.accountCv;
  hasCv = this.cvSearch.hasCv;
  cvFileName = this.cvSearch.cvFileName;
  // CV mode: the list shows vacancies matched to the uploaded CV instead of the filtered feed.
  cvMode = signal(false);
  cvLoading = signal(false);
  cvJobs = signal<VacancyItem[]>([]);
  cvProfile = signal<PublicCvSearchResult['profile'] | null>(null);
  cvError = signal('');
  displayedJobs = computed(() => (this.cvMode() ? this.cvJobs() : this.filteredJobs()));
  listLoading = computed(() => (this.cvMode() ? this.cvLoading() : this.isLoading()));

  defaultLocationOptions = [
    { value: 'all', label: 'ყველა ლოკაცია' },
    { value: 'თბილისი', label: 'თბილისი' },
    { value: 'ბათუმი', label: 'ბათუმი' },
    { value: 'რუსთავი', label: 'რუსთავი' },
    { value: 'ქუთაისი', label: 'ქუთაისი' },
    { value: 'გორი', label: 'გორი' }
  ];

  filteredLocationOptions = computed(() => {
    const cities = this.stateStore.cities() || [];
    const searchVal = this.locationSearch().toLowerCase().trim();

    let options: { value: string; label: string }[] = [];
    if (cities.length > 0) {
      options = [
        { value: 'all', label: 'ყველა ლოკაცია' },
        ...cities.map(c => ({ value: c.location, label: `${c.location} (${c.count})` }))
      ];
    } else {
      options = this.defaultLocationOptions;
    }

    if (!searchVal) {
      return options;
    }

    return [
      options[0],
      ...options.slice(1).filter(opt => opt.value.toLowerCase().includes(searchVal))
    ];
  });

  dateRangeOptions = [
    { value: 'all', label: 'ყველა დროის' },
    { value: 'yesterday', label: 'გუშინ' },
    { value: '3days', label: 'ბოლო 3 დღე' },
    { value: '7days', label: 'ბოლო 7 დღე' },
    { value: '30days', label: 'ბოლო 30 დღე' }
  ];

  allJobs = this.stateStore.publicJobs;
  filteredJobs = this.stateStore.publicJobs;

  /** The most one search shows (the API's MAX_SEARCH_RESULTS) */
  readonly maxResults = 60;
  /** What the AI read from the last search sentence (null for keyword searches) */
  aiSummary = computed(() => {
    const ai = this.stateStore.publicJobsInterpreted();
    return ai ? [ai.keywords, ai.city].filter(Boolean).join(' · ') || 'შენი მოთხოვნით' : null;
  });
  /** The last search had something to search for: Job Up shows nothing until it does */
  hasSearch = computed(
    () =>
      !!this.stateStore.publicJobsQuery().trim() ||
      this.stateStore.publicJobsLocation() !== 'all' ||
      this.stateStore.publicJobsCategory() !== 'all' ||
      this.stateStore.publicJobsSalaryOnly(),
  );

  private searchSub?: any;
  private liveSearchSub?: any;
  private queryParamsSub?: any;
  // Live search while typing must not scroll the input out of view; explicit filter changes do.
  private scrollToResults = true;

  ngOnInit() {
    this.seo.update({
      title: 'ვაკანსიები და სამსახური საქართველოში | Job Up',
      description: 'ეძებ სამსახურს? Job Up აერთიანებს საქართველოს ყველა ვაკანსიას ერთ სივრცეში. ატვირთე CV ან დაწერე რას ეძებ — AI იპოვის საუკეთესო ვარიანტებს.',
      // Filtered views (?search, ?location, ?source) all consolidate onto the main list.
      path: '/vacancies',
    });

    this.stateStore.loadCities();

    this.searchSub = this.locationSearchInput.valueChanges.pipe(
      debounceTime(150),
      distinctUntilChanged()
    ).subscribe(val => {
      this.locationSearch.set(val);
    });

    // Search as the user types: wait for a pause, skip single characters, and let an empty
    // box clear the search. Enter and the search button still apply immediately. Inside the
    // mobile filter modal nothing applies until ძიება is pressed.
    this.liveSearchSub = this.searchFilter.valueChanges.pipe(
      map(val => val.trim()),
      debounceTime(400),
      filter(() => !this.isFilterModalOpen()),
      distinctUntilChanged(),
      filter(val => val.length === 0 || val.length >= 2),
    ).subscribe(() => this.applyFilters(false));

    // The URL is the single source of truth for filters: a missing param means "all",
    // so returning from a job, refreshing or sharing a link restores the same list.
    this.queryParamsSub = this.route.queryParamMap.subscribe(params => {
      const date = params.get('date');
      // emitEvent: false, so restoring the box from the URL doesn't trigger a live search.
      this.searchFilter.setValue(params.get('search') ?? '', { emitEvent: false });
      this.sourceFilter.setValue(params.get('source') ?? 'all');
      this.categoryFilter.setValue(findJobCategory(params.get('category')) ? params.get('category')! : 'all');
      this.locationFilter.setValue(params.get('location') ?? 'all');
      this.dateRangeFilter.setValue(this.dateRangeOptions.some(o => o.value === date) ? date! : 'all');
      this.salaryOnly.set(params.get('salary') === '1');

      // loadJobs is a no-op when the same filters are already loaded.
      this.loadJobs();
    });
  }

  /** Writes the current filter controls to the URL; the queryParamMap subscription loads them. */
  applyFilters(scrollToResults = true) {
    this.scrollToResults = scrollToResults;
    const search = this.searchFilter.value.trim();
    const tree = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: {
        search: search || null,
        source: this.sourceFilter.value !== 'all' ? this.sourceFilter.value : null,
        category: this.categoryFilter.value !== 'all' ? this.categoryFilter.value : null,
        location: this.locationFilter.value !== 'all' ? this.locationFilter.value : null,
        date: this.dateRangeFilter.value !== 'all' ? this.dateRangeFilter.value : null,
        salary: this.salaryOnly() ? '1' : null,
      },
    });

    if (this.router.serializeUrl(tree) === this.router.url) {
      // Same URL means no navigation; load directly so e.g. a retry after an error still works.
      this.loadJobs();
      return;
    }
    // replaceUrl: filter tweaks don't pile up history entries. scroll: 'manual' stops the
    // router's scroll-to-top; loadJobs scrolls to the results itself.
    this.router.navigateByUrl(tree, { replaceUrl: true, scroll: 'manual' });
  }

  ngAfterViewInit() {
    afterNextRender(() => {
      this.cvSearch.loadUploadedCv();
      // ?mode=cv (the home hero's "all CV results"): open straight into CV search
      if (this.route.snapshot.queryParamMap.get('mode') === 'cv') this.setSearchMode('cv');
      this.loadCategoryCounts();
      this.setupInfiniteScroll();
      if (this.authService.isLoggedIn()) this.stateStore.getCv();
      this.updateChipsArrows();
      const track = this.popularTrackRef?.nativeElement;
      if (track && typeof ResizeObserver !== 'undefined') {
        this.popularResizeObserver = new ResizeObserver(() => this.updatePopularArrows());
        this.popularResizeObserver.observe(track);
      }
      this.ngZone.runOutsideAngular(() => this.initParticles());
    }, { injector: this.injector });
  }

  ngOnDestroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.searchSub) {
      this.searchSub.unsubscribe();
    }
    this.liveSearchSub?.unsubscribe();
    this.popularResizeObserver?.disconnect();
    this.infiniteObserver?.disconnect();
    if (this.queryParamsSub) {
      this.queryParamsSub.unsubscribe();
    }
    if (typeof document !== 'undefined') {
      document.body.classList.remove('modal-open');
    }
  }

  private initParticles() {
    const canvas = this.particleCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Stretch the canvas from the top of the section to the bottom of the filters
    const fitHeight = () => {
      const area = this.filtersAreaRef?.nativeElement;
      const parent = canvas.parentElement;
      if (!area || !parent) return;
      const h = Math.round(area.getBoundingClientRect().bottom - parent.getBoundingClientRect().top);
      if (h > 0) canvas.style.height = h + 'px';
    };

    const resize = () => {
      fitHeight();
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 80;
    interface Particle {
      x: number; y: number;
      r: number; speed: number;
      opacity: number; drift: number;
      color: string;
      vx?: number;
      vy?: number;
    }

    const colors = ['rgba(11,96,150,', 'rgba(151,174,213,', 'rgba(22,47,80,'];

    const make = (): Particle => ({
      x: Math.random() * canvas.width,
      y: canvas.height + Math.random() * 60,
      r: Math.random() * 2.5 + 2.0,
      speed: Math.random() * 1.1 + 0.4,
      opacity: Math.random() * 0.5 + 0.25,
      drift: (Math.random() - 0.5) * 1.0,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: 0,
      vy: 0
    });

    const particles: Particle[] = Array.from({ length: COUNT }, make);

    const container = this.searchContainerRef?.nativeElement;
    interface Bounds {
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
      centerX: number;
      centerY: number;
    }

    let bounds: Bounds = {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0
    };

    const getSafeBounds = (): Bounds => {
      if (!container) {
        return {
          left: canvas.width * 0.1,
          right: canvas.width * 0.9,
          top: canvas.height * 0.4,
          bottom: canvas.height * 0.6,
          width: canvas.width * 0.8,
          height: canvas.height * 0.2,
          centerX: canvas.width / 2,
          centerY: canvas.height / 2
        };
      }
      const canvasRect = canvas.getBoundingClientRect();
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return bounds.width > 0 ? bounds : {
          left: canvas.width * 0.1,
          right: canvas.width * 0.9,
          top: canvas.height * 0.4,
          bottom: canvas.height * 0.6,
          width: canvas.width * 0.8,
          height: canvas.height * 0.2,
          centerX: canvas.width / 2,
          centerY: canvas.height / 2
        };
      }
      return {
        left: rect.left - canvasRect.left,
        right: rect.right - canvasRect.left,
        top: rect.top - canvasRect.top,
        bottom: rect.bottom - canvasRect.top,
        width: rect.width,
        height: rect.height,
        centerX: (rect.left + rect.right) / 2 - canvasRect.left,
        centerY: (rect.top + rect.bottom) / 2 - canvasRect.top,
      };
    };

    bounds = getSafeBounds();
    window.addEventListener('resize', () => {
      resize();
      bounds = getSafeBounds();
    });

    let lastState: 'idle' | 'searching' | 'burst' = 'idle';

    let frame = 0;
    const draw = () => {
      // Content above the filters (cards, banner) can change height after load
      if (++frame % 30 === 0) fitHeight();
      if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
        resize();
        bounds = getSafeBounds();
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const state = this.searchState;

      if (state === 'searching' || state === 'burst') {
        bounds = getSafeBounds();
      }

      if (state === 'burst' && lastState !== 'burst') {
        for (const p of particles) {
          const angle = Math.atan2(p.y - bounds.centerY, p.x - bounds.centerX);
          const force = Math.random() * 6 + 4;
          p.vx = Math.cos(angle) * force;
          p.vy = Math.sin(angle) * force + 2;
        }
      }

      lastState = state;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.opacity})`;
        ctx.fill();

        if (state === 'searching') {
          const targetX = bounds.left + (i / COUNT) * bounds.width;
          const time = Date.now() * 0.006;
          const wave = Math.sin((targetX - bounds.left) * 0.03 - time) * 10;
          const targetY = bounds.bottom + 12 + wave;

          p.x += (targetX - p.x) * 0.08;
          p.y += (targetY - p.y) * 0.08;
          p.opacity += (0.75 - p.opacity) * 0.1;
        } else if (state === 'burst') {
          p.x += p.vx || 0;
          p.y += p.vy || 0;
          p.opacity -= 0.025;

          if (p.opacity <= 0) {
            Object.assign(p, make());
            const angle = Math.atan2(p.y - bounds.centerY, p.x - bounds.centerX);
            const force = Math.random() * 6 + 4;
            p.vx = Math.cos(angle) * force;
            p.vy = Math.sin(angle) * force + 2;
          }
        } else {
          p.y -= p.speed;
          p.x += p.drift;
          p.opacity -= 0.001;

          if (p.y < -10 || p.opacity <= 0) {
            Object.assign(p, make());
          }
        }
      }
      this.animationFrameId = requestAnimationFrame(draw);
    };

    draw();
  }

  constructor() {
    // When login status changes while user is on page, refresh public jobs.
    // Effects also run once on creation; skip that run, or it force-reloads jobs
    // that are already in the store.
    let previousLoggedIn: boolean | undefined;
    effect(() => {
      const loggedIn = this.authService.isLoggedIn();
      if (previousLoggedIn !== undefined && previousLoggedIn !== loggedIn) {
        untracked(() => this.loadJobs(this.searchFilter.value, false, true));
      }
      previousLoggedIn = loggedIn;
    });
  }

  async loadJobs(query?: string, append: boolean = false, force: boolean = false) {
    const q = query !== undefined ? query : this.searchFilter.value;
    const source = this.sourceFilter.value;
    const location = this.locationFilter.value;
    const dateRange = this.dateRangeFilter.value;

    const isAlreadyLoaded = !force && !append && this.stateStore.publicJobsLoaded() &&
      this.stateStore.publicJobs().length > 0 &&
      this.stateStore.publicJobsQuery() === q &&
      this.stateStore.publicJobsSource() === source &&
      this.stateStore.publicJobsLocation() === location &&
      this.stateStore.publicJobsDateRange() === dateRange &&
      this.stateStore.publicJobsSalaryOnly() === this.salaryOnly() &&
      this.stateStore.publicJobsCategory() === this.categoryFilter.value;

    if (isAlreadyLoaded) {
      if (this.isInitialLoad) {
        this.isInitialLoad = false;
      }
      return;
    }

    if (!append) {
      this.searchState = 'searching';
    }

    try {
      await this.stateStore.loadPublicJobs({
        query: q,
        source,
        location,
        dateRange,
        salaryOnly: this.salaryOnly(),
        category: this.categoryFilter.value,
        append,
        force
      });

      // A short page can leave the sentinel on screen, and an observer only reports changes
      if (append) setTimeout(() => this.observeSentinel());

      if (!append) {
        this.burstParticles();

        if (!this.isInitialLoad) {
          if (this.scrollToResults) this.scroll('results-container');
        } else {
          this.isInitialLoad = false;
        }
      }
    } catch (err: any) {
      console.error('Error fetching jobs:', err);
      if (err?.status === 401 && !this.authService.isLoggedIn()) {
        this.alertify.warning('გთხოვთ გაიაროთ ავტორიზაცია დამატებითი ვაკანსიების სანახავად');
        this.authService.openAuthModal('register');
      } else if (err?.status === 429) {
        this.alertify.warning('ძალიან ბევრი მოთხოვნაა. გთხოვთ სცადოთ ცოტა ხანში.');
      }
      this.searchState = 'idle';
    }
  }

  /** Ends a search's particle wave: burst outward, then settle back to idle. */
  private burstParticles() {
    this.searchState = 'burst';
    setTimeout(() => {
      if (this.searchState === 'burst') {
        this.searchState = 'idle';
      }
    }, 600);
  }

  loadMore() {
    this.loadJobs(this.searchFilter.value, true);
  }

  /** Pages that load by themselves while scrolling; after that the button takes over, so the footer stays reachable. */
  private readonly autoLoadPages = 5;

  /** Infinite scroll: loads the next page when the end of the list comes within 600px. */
  private setupInfiniteScroll() {
    if (typeof IntersectionObserver === 'undefined') return; // the button still works
    this.infiniteObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (this.cvMode() || !this.hasMoreJobs() || this.isLoading() || this.isAppending()) return;
        if (this.currentPage >= this.autoLoadPages) return;
        this.ngZone.run(() => this.loadMore());
      },
      { rootMargin: '0px 0px 600px 0px' },
    );
    // The sentinel may already be on the page: its ViewChild setter ran before the observer existed
    this.observeSentinel();
  }

  /** (Re)watches the sentinel; re-observing also re-checks it when it is still on screen. */
  private observeSentinel() {
    this.infiniteObserver?.disconnect();
    if (this.sentinelEl) this.infiniteObserver?.observe(this.sentinelEl);
  }

  readonly jobUpLogo = JOBUP_LOGO;
  /** Company logos on the cards; falls back to the letter when an image fails */
  readonly logos = new CompanyLogos();
  readonly jobUpSource = JOBUP_SOURCE;

  detectSource(sourceOrLink?: string, linkFallback?: string, company?: string): string {
    return detectJobSource(sourceOrLink, linkFallback, company);
  }

  formatDate(dateStr: any): string {
    if (!dateStr) return 'დღეს';
    try {
      let date: Date;
      if (typeof dateStr === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateStr.trim())) {
        return dateStr.trim();
      } else {
        date = new Date(dateStr);
      }

      if (isNaN(date.getTime())) return dateStr;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  }

  private parseJobDate(dateStr?: string): Date | null {
    if (!dateStr) return null;
    const trimmed = dateStr.trim();
    let date: Date;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      const [day, month, year] = trimmed.split('/').map(Number);
      date = new Date(year, month - 1, day);
    } else {
      date = new Date(trimmed);
    }
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Deadline cell: color class plus `progress` (0–100) for the bar = share of the application
   * window still left. Without a deadline the bar shows freshness over a 30-day window instead.
   */
  getDeadlineStatus(
    deadlineStr?: string,
    publishDateStr?: string,
  ): { text: string; class: 'fresh' | 'warning' | 'urgent' | 'expired' | 'none'; progress: number } {
    const targetDateStr = deadlineStr || publishDateStr;
    if (!targetDateStr) return { text: 'მითითებული არ არის', class: 'none', progress: 0 };

    const targetDate = this.parseJobDate(targetDateStr);
    if (!targetDate) return { text: targetDateStr, class: 'none', progress: 0 };

    const dayMs = 1000 * 60 * 60 * 24;
    const now = Date.now();
    const diffDays = Math.ceil((targetDate.getTime() - now) / dayMs);
    const text = this.formatDate(targetDateStr);
    const clamp = (p: number) => Math.max(0, Math.min(100, Math.round(p)));

    if (deadlineStr) {
      if (diffDays < 0) return { text, class: 'expired', progress: 0 };

      const published = this.parseJobDate(publishDateStr);
      const windowMs =
        published && published < targetDate ? targetDate.getTime() - published.getTime() : 30 * dayMs;
      // Keep a sliver visible until the day itself passes
      const progress = Math.max(4, clamp(((targetDate.getTime() - now) / windowMs) * 100));
      const cls = diffDays <= 7 ? 'urgent' : diffDays <= 21 ? 'warning' : 'fresh';
      return { text, class: cls, progress };
    }

    const daysOld = Math.abs(diffDays);
    const progress = Math.max(4, clamp(100 - (daysOld / 30) * 100));
    const cls = daysOld <= 7 ? 'fresh' : daysOld <= 21 ? 'warning' : 'urgent';
    return { text, class: cls, progress };
  }

  setSource(source: string) {
    this.sourceFilter.setValue(source);
    this.applyFilters();
  }

  updatePopularArrows() {
    const el = this.popularTrackRef?.nativeElement;
    if (!el) return;
    this.popularCanScrollLeft.set(el.scrollLeft > 2);
    this.popularCanScrollRight.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }

  scrollPopular(direction: 1 | -1) {
    const el = this.popularTrackRef?.nativeElement;
    el?.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: 'smooth' });
  }

  clearFilters() {
    this.searchFilter.setValue('');
    this.locationFilter.setValue('all');
    this.locationSearchInput.setValue('');
    this.sourceFilter.setValue('all');
    this.dateRangeFilter.setValue('all');
    this.salaryOnly.set(false);
    this.categoryFilter.setValue('all');
    this.closeAllDropdowns();
    this.applyFilters();
  }

  toggleSalaryOnly() {
    this.salaryOnly.update((v) => !v);
    this.applyFilters();
  }

  /** Small attribution under the title; nothing for Job Up's own postings. */
  readonly sourceIcons: Record<string, string> = {
    'jobs.ge': '/icons/jobs.png',
    'hr.ge': '/icons/hr.png',
    'awork.ge': '/icons/awork.png',
    'myjobs.ge': '/icons/myjobsge.png',
    linkedin: '/icons/linkedin.png',
  };

  sourceLabel(source: string): string {
    return source === 'linkedin' ? 'LinkedIn' : source;
  }

  getSelectedLocationLabel(): string {
    const val = this.locationFilter.value;
    if (val === 'all') return 'ყველა ლოკაცია';
    const cities = this.stateStore.cities() || [];
    const found = cities.find(c => c.location === val);
    return found ? found.location : val;
  }

  getSelectedDateRangeLabel(): string {
    const val = this.dateRangeFilter.value;
    const option = this.dateRangeOptions.find(o => o.value === val);
    return option ? option.label : 'ყველა დროის';
  }

  getSelectedCategory() {
    return findJobCategory(this.categoryFilter.value);
  }

  /** Category dropdown option */
  selectCategory(key: string) {
    this.categoryFilter.setValue(key);
    this.isCategoryOpen.set(false);
    this.applyFilters();
  }

  /** Mobile category chip: tapping the active one clears it */
  setCategory(key: string) {
    this.categoryFilter.setValue(this.categoryFilter.value === key ? 'all' : key);
    this.applyFilters();
  }

  private async loadCategoryCounts() {
    try {
      const rows = await firstValueFrom(this.jobsService.getCategoryCounts());
      this.categoryCounts.set(Object.fromEntries(rows.map((r) => [r.category, r.count])));
    } catch {
      // Counts are decoration; an API without /job/categories just shows none
    }
  }

  selectLocation(value: string) {
    this.locationFilter.setValue(value);
    this.isLocationOpen.set(false);
    this.applyFilters();
  }

  selectDateRange(value: string) {
    this.dateRangeFilter.setValue(value);
    this.isDateRangeOpen.set(false);
    this.applyFilters();
  }

  toggleCategoryDropdown(event: Event) {
    event.stopPropagation();
    this.isCategoryOpen.update(v => !v);
    this.isLocationOpen.set(false);
    this.isDateRangeOpen.set(false);
  }

  toggleLocationDropdown(event: Event) {
    event.stopPropagation();
    this.isLocationOpen.update(v => !v);
    this.isCategoryOpen.set(false);
    this.isDateRangeOpen.set(false);
  }

  toggleDateRangeDropdown(event: Event) {
    event.stopPropagation();
    this.isDateRangeOpen.update(v => !v);
    this.isCategoryOpen.set(false);
    this.isLocationOpen.set(false);
  }

  closeAllDropdowns() {
    this.isCategoryOpen.set(false);
    this.isLocationOpen.set(false);
    this.isDateRangeOpen.set(false);
    this.locationSearchInput.setValue('');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    this.closeAllDropdowns();
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.updateChipsArrows();
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    if (typeof window !== 'undefined') {
      const vacanciesSec = this.vacanciesSectionRef?.nativeElement;
      if (vacanciesSec) {
        const rect = vacanciesSec.getBoundingClientRect();
        const pastStart = rect.top <= 100;
        const isMobile = window.innerWidth <= 991;
        this.showScrollToFilters.set(pastStart && isMobile);
      }
    }
  }

  openFilterModal() {
    this.isFilterModalOpen.set(true);
    if (typeof document !== 'undefined') {
      document.body.classList.add('modal-open');
    }
  }

  closeFilterModal() {
    this.isFilterModalOpen.set(false);
    if (typeof document !== 'undefined') {
      document.body.classList.remove('modal-open');
    }
  }

  async openCvSearchModal(reupload = false) {
    // The modal's search button, or a finished upload while CV mode is on
    if (await this.cvSearch.openUploadModal({ reupload, searchAfterUpload: this.cvMode() })) {
      this.cvMode.set(true);
      this.searchByCv();
    }
  }

  /** The search switch: manual filters (default) or CV search, never both at once. */
  setSearchMode(mode: 'manual' | 'cv') {
    if (mode === 'manual') {
      this.exitCvMode();
      return;
    }
    if (this.cvMode()) return;
    this.cvMode.set(true);
    this.searchByCv();
  }

  /**
   * Loads vacancies matched against the uploaded CV (anonymous, token-based) or, failing that,
   * the signed-in user's account CV into CV mode. Without either it does nothing: the CV-mode
   * empty state asks for an upload.
   */
  async searchByCv() {
    this.cvError.set('');
    this.cvJobs.set([]);
    this.cvProfile.set(null);
    if (!this.hasCv()) return;

    this.cvLoading.set(true);
    // Same particle wave under the filters card as the manual search.
    this.searchState = 'searching';
    try {
      // CV only: the manual filters are hidden in CV mode and don't narrow the results.
      const res = await this.cvSearch.search();
      this.cvProfile.set(res.profile);
      this.cvJobs.set(
        res.jobs.map((job) => ({
          id: job.id,
          vacancy: job.vacancy,
          company: job.company,
          location: job.location || 'Remote',
          source: detectJobSource('', job.link || '', job.company),
          salaryRange: extractSalary(job),
          publishDate: formatJobDate(job.publishDate),
          deadline: job.deadline ? formatJobDate(job.deadline) : '',
          matchScore: job.match,
          link: job.link,
          companyLogo: job.companyLogo ?? null,
          companyKey: job.companyKey ?? null,
        })),
      );
      this.burstParticles();
      this.scroll('results-container');
    } catch (err: any) {
      this.searchState = 'idle';
      // '' when the saved CV is gone: the empty state then asks for a new upload
      this.cvError.set(this.cvSearch.errorMessage(err));
    } finally {
      this.cvLoading.set(false);
    }
  }

  exitCvMode() {
    this.cvMode.set(false);
    this.cvJobs.set([]);
    this.cvProfile.set(null);
    this.cvError.set('');
  }

  scrollToFilters() {
    if (window.innerWidth <= 991) {
      this.openFilterModal();
    } else {
      this.searchContainerRef?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  updateChipsArrows() {
    const el = this.sourceChipsRef?.nativeElement;
    if (!el) return;
    // 2px tolerance for sub-pixel scroll positions.
    this.chipsCanScrollLeft.set(el.scrollLeft > 2);
    this.chipsCanScrollRight.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }

  scrollChips(direction: 1 | -1) {
    const el = this.sourceChipsRef?.nativeElement;
    el?.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: 'smooth' });
  }

  scroll(target: string) {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

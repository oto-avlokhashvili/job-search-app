import { CompanyLogos } from '../../../Core/Utils/company-logos';
import { Component, ElementRef, inject, Injector, OnInit, signal, computed, effect, ViewChild, AfterViewInit, OnDestroy, NgZone, HostListener, afterNextRender, untracked } from '@angular/core';
import { Router, RouterModule, ActivatedRoute, NavigationStart } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { StateStore, detectJobSource, formatJobDate, JOBUP_LOGO, JOBUP_SOURCE } from '../../../Store/state.store';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import type { SavedCvSubmission } from '../public-cv-modal/public-cv-modal';
import { PUBLIC_CV_STORAGE_KEY } from '../../../Core/Utils/public-cv-storage';
import { debounceTime, distinctUntilChanged, filter, firstValueFrom, map } from 'rxjs';
import { Cv, PublicCvSearchResult } from '../../../Core/Services/cv';
import { JobsService } from '../../../Core/Services/jobs-service';
import { extractSalary } from '../../../Core/Utils/salary-extractor';
import { generateJobSlug } from '../../../Core/Utils/slug-generator';
import { SeoService } from '../../../Core/Services/seo.service';

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
}

/**
 * The job last opened from the list and where its row sat on screen, so going back from the
 * job puts that row in the same spot. Lives outside the component, which is destroyed meanwhile.
 */
let lastOpenedJob: { url: string; jobId: number; viewportTop: number; scrollY: number } | null = null;

@Component({
  selector: 'app-vacancies',
  standalone: true,
  imports: [RouterModule, CommonModule, ReactiveFormsModule, MatTooltipModule],
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
  private cvService = inject(Cv);

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
  jobsGeCount = this.stateStore.publicJobsGeCount;
  hrGeCount = this.stateStore.publicHrGeCount;
  aworkGeCount = this.stateStore.publicAworkGeCount;
  myjobsGeCount = this.stateStore.publicMyjobsGeCount;
  linkedinCount = this.stateStore.publicLinkedinCount;
  hasMoreJobs = this.stateStore.publicHasMore;

  // Filter Form Controls
  searchFilter = new FormControl<string>('', { nonNullable: true });
  locationFilter = new FormControl<string>('all', { nonNullable: true });
  locationSearchInput = new FormControl<string>('', { nonNullable: true });
  locationSearch = signal<string>('');
  sourceFilter = new FormControl<string>('all', { nonNullable: true });
  dateRangeFilter = new FormControl<string>('all', { nonNullable: true });

  isSourceOpen = signal<boolean>(false);
  isLocationOpen = signal<boolean>(false);
  isDateRangeOpen = signal<boolean>(false);
  showScrollToFilters = signal<boolean>(false);
  // Arrows on the mobile source chip row; the right one shows by default so the server
  // render already hints that the row scrolls.
  chipsCanScrollLeft = signal(false);
  chipsCanScrollRight = signal(true);
  isFilterModalOpen = signal<boolean>(false);
  uploadedCv = signal<SavedCvSubmission | null>(null);
  // Signed-in users can search with the CV saved on their account (uploaded on the profile page).
  accountCv = computed(() => (this.authService.isLoggedIn() ? this.stateStore.userCv() : null));
  /** A CV this page can search with; the browser's own upload wins over the account CV. */
  hasCv = computed(() => !!this.uploadedCv() || !!this.accountCv());
  cvFileName = computed(() => this.uploadedCv()?.fileName || this.accountCv()?.originalName || '');
  // CV mode: the list shows vacancies matched to the uploaded CV instead of the filtered feed.
  cvMode = signal(false);
  cvLoading = signal(false);
  cvJobs = signal<VacancyItem[]>([]);
  cvProfile = signal<PublicCvSearchResult['profile'] | null>(null);
  cvError = signal('');
  displayedJobs = computed(() => (this.cvMode() ? this.cvJobs() : this.filteredJobs()));
  listLoading = computed(() => (this.cvMode() ? this.cvLoading() : this.isLoading()));

  sourceOptions = computed(() => [
    { value: 'all', label: 'ყველა პორტალი', icon: 'apps', count: this.dbTotalRecords(), isCircular: false, logo: '' },
    { value: 'jobs.ge', label: 'Jobs.ge', icon: '', count: this.jobsGeCount(), isCircular: false, logo: '/icons/jobs.png' },
    { value: 'hr.ge', label: 'HR.ge', icon: '', count: this.hrGeCount(), isCircular: false, logo: '/icons/hr.png' },
    { value: 'awork.ge', label: 'Awork.ge', icon: '', count: this.aworkGeCount(), isCircular: false, logo: '/icons/awork.png' },
    { value: 'myjobs.ge', label: 'Myjobs.ge', icon: '', count: this.myjobsGeCount(), isCircular: true, logo: '/icons/myjobsge.png' },
    { value: 'linkedin', label: 'LinkedIn', icon: '', count: this.linkedinCount(), isCircular: false, logo: '/icons/linkedin.png' }
  ]);

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

  private searchSub?: any;
  private liveSearchSub?: any;
  private queryParamsSub?: any;
  private navigationSub?: any;
  // Live search while typing must not scroll the input out of view; explicit filter changes do.
  private scrollToResults = true;

  ngOnInit() {
    this.seo.update({
      title: 'ვაკანსიები და სამსახური საქართველოში | Job Up',
      description: 'იპოვე სამსახური მარტივად — ყველა აქტიური ვაკანსია საქართველოში Jobs.ge, HR.ge, Awork.ge, Myjobs.ge და LinkedIn-დან ერთ სივრცეში. ახალი ვაკანსიები ყოველდღე.',
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
      this.locationFilter.setValue(params.get('location') ?? 'all');
      this.dateRangeFilter.setValue(this.dateRangeOptions.some(o => o.value === date) ? date! : 'all');

      // loadJobs is a no-op when the same filters are already loaded.
      this.loadJobs();
    });

    this.navigationSub = this.router.events
      .pipe(filter((e): e is NavigationStart => e instanceof NavigationStart))
      .subscribe(e => this.rememberOpenedJob(e.url));
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
        location: this.locationFilter.value !== 'all' ? this.locationFilter.value : null,
        date: this.dateRangeFilter.value !== 'all' ? this.dateRangeFilter.value : null,
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
      this.loadUploadedCv();
      if (this.authService.isLoggedIn()) this.stateStore.getCv();
      this.updateChipsArrows();
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
    if (this.queryParamsSub) {
      this.queryParamsSub.unsubscribe();
    }
    this.navigationSub?.unsubscribe();
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

    // Coming back from the job that was opened from this list (Back, the job page's back
    // button, its breadcrumb): put that job where it was. While this runs, the previous
    // navigation is still the job page's.
    const cameFrom = this.router.lastSuccessfulNavigation()?.finalUrl?.toString() ?? '';
    if (lastOpenedJob && cameFrom.startsWith('/vacancies/')) {
      afterNextRender(() => this.holdOpenedJob(), { injector: this.injector });
    }
  }

  /**
   * The router scrolls to the top after the page renders, and a smooth scroll still running
   * from the job page can land even later, so keep the job in place for a moment instead of
   * scrolling once. Any scrolling by the user ends it.
   */
  private holdOpenedJob() {
    const until = performance.now() + 1500;
    let stopped = false;
    const stop = () => (stopped = true);
    const userEvents = ['wheel', 'touchstart', 'keydown', 'mousedown'];
    userEvents.forEach(type => window.addEventListener(type, stop, { once: true, passive: true }));

    const row = this.restoreOpenedJob();
    row?.classList.add('just-visited');
    setTimeout(() => row?.classList.remove('just-visited'), 1600);

    const tick = () => {
      if (stopped || performance.now() > until) {
        userEvents.forEach(type => window.removeEventListener(type, stop));
        lastOpenedJob = null;
        return;
      }
      this.restoreOpenedJob();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /**
   * Runs as navigation leaves the list, while its rows are still on screen. A (click) on the
   * rows isn't enough: on rows hydrated from the server render it doesn't fire.
   */
  private rememberOpenedJob(url: string) {
    lastOpenedJob = null;
    // CV results aren't kept when leaving the page, so there is nothing to return to.
    if (this.cvMode()) return;
    const path = decodeURIComponent(url.split(/[?#]/)[0]);
    const job = this.displayedJobs().find(j => `/vacancies/${this.getJobSlug(j)}` === path);
    if (!job) return;
    const row = Array.from(document.querySelectorAll<HTMLElement>(`[data-job-id="${job.id}"]`))
      .find(el => el.offsetParent !== null);
    if (!row) return;
    lastOpenedJob = {
      url: this.router.url,
      jobId: job.id,
      viewportTop: row.getBoundingClientRect().top,
      scrollY: window.scrollY,
    };
  }

  /** Scrolls the opened job back to where it sat on screen; returns its row, if it is listed. */
  private restoreOpenedJob(): HTMLElement | undefined {
    const saved = lastOpenedJob;
    if (!saved || saved.url !== this.router.url) return;
    // The table (desktop) and the cards (mobile) are both rendered; use whichever is visible.
    const row = Array.from(document.querySelectorAll<HTMLElement>(`[data-job-id="${saved.jobId}"]`))
      .find(el => el.offsetParent !== null);
    if (!row) {
      if (Math.abs(window.scrollY - saved.scrollY) > 1) window.scrollTo({ top: saved.scrollY, behavior: 'instant' });
      return;
    }
    const offset = row.getBoundingClientRect().top - saved.viewportTop;
    if (Math.abs(offset) > 1) window.scrollBy({ top: offset, behavior: 'instant' });
    return row;
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
      this.stateStore.publicJobsDateRange() === dateRange;

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
        append,
        force
      });

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
    if (this.currentPage >= 5 && !this.authService.isLoggedIn()) {
      this.alertify.warning('გთხოვთ გაიაროთ ავტორიზაცია დამატებითი ვაკანსიების სანახავად');
      this.authService.openAuthModal('register');
      return;
    }
    this.loadJobs(this.searchFilter.value, true);
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

  toggleSourceCard(source: string) {
    if (this.sourceFilter.value === source) {
      this.setSource('all');
    } else {
      this.setSource(source);
    }
  }

  setPopularSearch(keyword: string) {
    this.searchFilter.setValue(this.searchFilter.value === keyword ? '' : keyword);
    this.applyFilters();
  }

  clearFilters() {
    this.searchFilter.setValue('');
    this.locationFilter.setValue('all');
    this.locationSearchInput.setValue('');
    this.sourceFilter.setValue('all');
    this.dateRangeFilter.setValue('all');
    this.closeAllDropdowns();
    this.applyFilters();
  }

  getSelectedSourceLabel(): string {
    const val = this.sourceFilter.value;
    const found = this.sourceOptions().find(o => o.value === val);
    return found ? found.label : 'ყველა პორტალი';
  }

  getSelectedSourceLogo(): string | null {
    const val = this.sourceFilter.value;
    const found = this.sourceOptions().find(o => o.value === val);
    return found?.logo || null;
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

  selectSource(value: string) {
    this.sourceFilter.setValue(value);
    this.isSourceOpen.set(false);
    this.applyFilters();
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

  toggleSourceDropdown(event: Event) {
    event.stopPropagation();
    this.isSourceOpen.update(v => !v);
    this.isLocationOpen.set(false);
    this.isDateRangeOpen.set(false);
  }

  toggleLocationDropdown(event: Event) {
    event.stopPropagation();
    this.isLocationOpen.update(v => !v);
    this.isSourceOpen.set(false);
    this.isDateRangeOpen.set(false);
  }

  toggleDateRangeDropdown(event: Event) {
    event.stopPropagation();
    this.isDateRangeOpen.update(v => !v);
    this.isSourceOpen.set(false);
    this.isLocationOpen.set(false);
  }

  closeAllDropdowns() {
    this.isSourceOpen.set(false);
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
    // Loaded on demand, like the chat widget: most visitors never open it.
    const { PublicCvModal } = await import('../public-cv-modal/public-cv-modal');
    const ref = this.dialog.open(PublicCvModal, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'public-cv-dialog',
      autoFocus: false,
      data: { mode: 'search', reupload },
    });
    ref.afterClosed().subscribe((result) => {
      this.loadUploadedCv();
      // 'search' = the modal's search button; true = closed after a successful upload.
      if (result === 'search' || (result === true && this.cvMode())) {
        this.cvMode.set(true);
        this.searchByCv();
      }
    });
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

  /** The public CV modal records the last upload in localStorage; mirror it in the banner. */
  private loadUploadedCv() {
    try {
      const stored = localStorage.getItem(PUBLIC_CV_STORAGE_KEY);
      const parsed: SavedCvSubmission | null = stored ? JSON.parse(stored) : null;
      this.uploadedCv.set(parsed?.email ? parsed : null);
    } catch {
      this.uploadedCv.set(null);
    }
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
      const res = await this.fetchCvMatches();
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
        })),
      );
      this.burstParticles();
      this.scroll('results-container');
    } catch (err: any) {
      this.searchState = 'idle';
      if (err?.status === 410 && !this.hasCv()) {
        // The saved CV is gone from the database: the empty state asks for a new upload.
      } else if (err?.status === 429) {
        const minutes = Math.ceil((err.error?.retryAfter || 3600) / 60);
        this.cvError.set(`ძიების ლიმიტი ამოიწურა, სცადეთ ${minutes} წუთში`);
      } else {
        this.cvError.set(err?.error?.message || 'CV-ით ძიება ვერ მოხერხდა, სცადეთ თავიდან');
      }
    } finally {
      this.cvLoading.set(false);
    }
  }

  /**
   * The browser that uploaded the CV stays trusted: an upload saved without a token (from before
   * CV search) or whose token was replaced from another device is reconnected silently instead
   * of asking for the file again.
   */
  private async fetchCvMatches(): Promise<PublicCvSearchResult> {
    const saved = this.uploadedCv();
    if (saved) {
      try {
        const token = saved.searchToken || (await this.reconnectSavedCv(saved));
        try {
          return await firstValueFrom(this.cvService.searchPublicCv(token));
        } catch (err: any) {
          if (err?.status !== 401 || !saved.searchToken) throw err;
          return await firstValueFrom(this.cvService.searchPublicCv(await this.reconnectSavedCv(saved)));
        }
      } catch (err: any) {
        // 410 = no such CV in the database any more (a 404 is just an API without this route); fall back to the account CV if there is one.
        if (err?.status !== 410) throw err;
        this.dropSavedCv();
        if (!this.accountCv()) throw err;
      }
    }
    return firstValueFrom(this.cvService.searchMyCv());
  }

  /** Gets a fresh search token for the saved upload and stores it, so this happens only once. */
  private async reconnectSavedCv(saved: SavedCvSubmission): Promise<string> {
    if (!saved.fileName) throw { status: 410 };
    const res = await firstValueFrom(this.cvService.reconnectPublicCv(saved.email, saved.fileName));
    const updated: SavedCvSubmission = { ...saved, searchToken: res.searchToken, searchAvailable: res.searchAvailable };
    try {
      localStorage.setItem(PUBLIC_CV_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
    this.uploadedCv.set(updated);
    return res.searchToken;
  }

  exitCvMode() {
    this.cvMode.set(false);
    this.cvJobs.set([]);
    this.cvProfile.set(null);
    this.cvError.set('');
  }

  private dropSavedCv() {
    try {
      localStorage.removeItem(PUBLIC_CV_STORAGE_KEY);
    } catch {}
    this.uploadedCv.set(null);
  }

  scrollToFilters() {
    if (window.innerWidth <= 991) {
      this.openFilterModal();
    } else {
      this.searchContainerRef?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  getJobSlug(job: { id: number | string; vacancy?: string; company?: string }): string {
    return generateJobSlug(job.vacancy, job.company, job.id);
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

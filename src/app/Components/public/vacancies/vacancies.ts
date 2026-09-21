import { Component, ElementRef, inject, Injector, OnInit, signal, computed, effect, ViewChild, AfterViewInit, OnDestroy, NgZone, HostListener, afterNextRender } from '@angular/core';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { StateStore } from '../../../Store/state.store';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { JobsService } from '../../../Core/Services/jobs-service';
import { extractSalary } from '../../../Core/Utils/salary-extractor';
import { generateJobSlug } from '../../../Core/Utils/slug-generator';
import { Title, Meta } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { PublicCvModal } from '../public-cv-modal/public-cv-modal';

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
}

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
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private dialog = inject(MatDialog);

  @ViewChild('particleCanvas') particleCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('searchContainer') searchContainerRef!: ElementRef;
  @ViewChild('vacanciesSection') vacanciesSectionRef!: ElementRef;

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
  isFilterModalOpen = signal<boolean>(false);

  sourceOptions = computed(() => [
    { value: 'all', label: 'ყველა პორტალი', icon: 'apps', count: this.dbTotalRecords(), isCircular: false, logo: '' },
    { value: 'jobs.ge', label: 'Jobs.ge', icon: '', count: this.jobsGeCount(), isCircular: false, logo: '/icons/jobs.png' },
    { value: 'hr.ge', label: 'HR.ge', icon: '', count: this.hrGeCount(), isCircular: false, logo: '/icons/hr.png' },
    { value: 'awork.ge', label: 'Awork.ge', icon: '', count: this.aworkGeCount(), isCircular: false, logo: '/icons/awork.png' },
    { value: 'myjobs.ge', label: 'Myjobs.ge', icon: '', count: this.myjobsGeCount(), isCircular: true, logo: '/icons/myjobsge.png' }
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
  private queryParamsSub?: any;

  ngOnInit() {
    this.titleService.setTitle('აქტიური ვაკანსიები | Job Up');
    this.metaService.updateTag({ name: 'description', content: 'მოიძიეთ უახლესი აქტიური ვაკანსიები საქართველოში Jobs.ge, HR.ge, Awork.ge და Myjobs.ge პორტალებიდან ერთ სივრცეში.' });

    this.stateStore.loadCities();

    this.searchSub = this.locationSearchInput.valueChanges.pipe(
      debounceTime(150),
      distinctUntilChanged()
    ).subscribe(val => {
      this.locationSearch.set(val);
    });

    this.queryParamsSub = this.route.queryParams.subscribe(params => {
      let hasFilterParam = false;
      if (params['source']) {
        this.sourceFilter.setValue(params['source']);
        hasFilterParam = true;
      }
      if (params['location']) {
        this.locationFilter.setValue(params['location']);
        hasFilterParam = true;
      }
      if (params['search']) {
        this.searchFilter.setValue(params['search']);
        hasFilterParam = true;
      }

      if (hasFilterParam) {
        this.loadJobs(this.searchFilter.value);
      }
    });
  }

  ngAfterViewInit() {
    afterNextRender(() => {
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

    const resize = () => {
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

    const draw = () => {
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
    effect(() => {
      const loggedIn = this.authService.isLoggedIn();
      // When login status changes while user is on page, refresh public jobs
      if (!this.isInitialLoad) {
        this.loadJobs(this.searchFilter.value, false, true);
      }
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
        this.searchState = 'burst';
        setTimeout(() => {
          if (this.searchState === 'burst') {
            this.searchState = 'idle';
          }
        }, 600);

        if (!this.isInitialLoad) {
          this.scroll('results-container');
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

  loadMore() {
    if (this.currentPage >= 5 && !this.authService.isLoggedIn()) {
      this.alertify.warning('გთხოვთ გაიაროთ ავტორიზაცია დამატებითი ვაკანსიების სანახავად');
      this.authService.openAuthModal('register');
      return;
    }
    this.loadJobs(this.searchFilter.value, true);
  }

  detectSource(sourceOrLink?: string, linkFallback?: string): string {
    const l = `${sourceOrLink || ''} ${linkFallback || ''}`.toLowerCase();
    if (l.includes('myjobs.ge') || l.includes('myjobs') || l.includes('myjob')) return 'myjobs.ge';
    if (l.includes('jobs.ge') || l.includes('jobsge')) return 'jobs.ge';
    if (l.includes('hr.ge') || l.includes('hrge')) return 'hr.ge';
    if (l.includes('awork.ge') || l.includes('awork')) return 'awork.ge';
    return 'other';
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

  getDeadlineStatus(deadlineStr?: string, publishDateStr?: string): { text: string; class: 'fresh' | 'warning' | 'urgent' | 'expired' | 'none' } {
    const targetDateStr = deadlineStr || publishDateStr;
    if (!targetDateStr) return { text: 'მითითებული არ არის', class: 'none' };

    let targetDate: Date | null = null;
    try {
      if (typeof targetDateStr === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(targetDateStr.trim())) {
        const [day, month, year] = targetDateStr.trim().split('/').map(Number);
        targetDate = new Date(year, month - 1, day);
      } else {
        targetDate = new Date(targetDateStr);
      }
    } catch {
      targetDate = null;
    }

    if (!targetDate || isNaN(targetDate.getTime())) {
      return { text: targetDateStr, class: 'none' };
    }

    const now = new Date();
    const diffMs = targetDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const formattedText = this.formatDate(targetDateStr);

    if (deadlineStr) {
      if (diffDays < 0) {
        return { text: formattedText, class: 'expired' };
      } else if (diffDays <= 7) {
        return { text: formattedText, class: 'urgent' };
      } else if (diffDays <= 21) {
        return { text: formattedText, class: 'warning' };
      } else {
        return { text: formattedText, class: 'fresh' };
      }
    } else {
      const daysOld = Math.abs(diffDays);
      if (daysOld <= 7) {
        return { text: formattedText, class: 'fresh' };
      } else if (daysOld <= 21) {
        return { text: formattedText, class: 'warning' };
      } else {
        return { text: formattedText, class: 'urgent' };
      }
    }
  }

  setSource(source: string) {
    this.sourceFilter.setValue(source);
    this.loadJobs(this.searchFilter.value);
  }

  toggleSourceCard(source: string) {
    if (this.sourceFilter.value === source) {
      this.setSource('all');
    } else {
      this.setSource(source);
    }
  }

  setPopularSearch(keyword: string) {
    if (this.searchFilter.value === keyword) {
      this.searchFilter.setValue('');
      this.loadJobs('');
    } else {
      this.searchFilter.setValue(keyword);
      this.loadJobs(keyword);
    }
  }

  clearFilters() {
    this.searchFilter.setValue('');
    this.locationFilter.setValue('all');
    this.locationSearchInput.setValue('');
    this.sourceFilter.setValue('all');
    this.dateRangeFilter.setValue('all');
    this.closeAllDropdowns();
    this.loadJobs('');
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
    this.loadJobs();
  }

  selectLocation(value: string) {
    this.locationFilter.setValue(value);
    this.isLocationOpen.set(false);
    this.loadJobs();
  }

  selectDateRange(value: string) {
    this.dateRangeFilter.setValue(value);
    this.isDateRangeOpen.set(false);
    this.loadJobs();
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

  scrollToFilters() {
    if (window.innerWidth <= 991) {
      this.openFilterModal();
    } else {
      this.searchContainerRef?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  viewVacancy(jobId: number | string, job?: { vacancy?: string; company?: string }) {
    if (!job) {
      job = this.allJobs().find(j => j.id === jobId) || this.filteredJobs().find(j => j.id === jobId);
    }
    const slug = generateJobSlug(job?.vacancy, job?.company, jobId);
    this.router.navigate(['/vacancies', slug]);
  }

  openPublicCvModal() {
    this.dialog.open(PublicCvModal, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'public-cv-dialog',
      autoFocus: false,
    });
  }

  scroll(target: string) {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

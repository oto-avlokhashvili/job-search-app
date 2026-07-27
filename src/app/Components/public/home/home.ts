import { Component, ElementRef, inject, OnInit, signal, computed, ViewChild, AfterViewInit, OnDestroy, NgZone, HostListener } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../Core/Services/auth-service';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { environment } from '../../../../environments/environment';
import { StateStore } from '../../../Store/state.store';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionModal } from '../../private/private-layout/subscription-modal/subscription-modal';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { JobsService } from '../../../Core/Services/jobs-service';
import { Job } from '../../../Core/Interfaces/jobs';

interface HomeJob {
  id: number;
  vacancy: string;
  company: string;
  location: string;
  source: string;
  salaryRange?: string;
  publishDate: string;
  matchScore: number;
  link: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterModule, CommonModule, ReactiveFormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit, AfterViewInit, OnDestroy {
  authService = inject(AuthService);
  stateStore = inject(StateStore);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private jobsService = inject(JobsService);
  private ngZone = inject(NgZone);

  @ViewChild('particleCanvas') particleCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('searchContainer') searchContainerRef!: ElementRef;

  private animationFrameId: number | null = null;
  searchState: 'idle' | 'searching' | 'burst' = 'idle';
  isLoading = signal<boolean>(false);
  isAppending = signal<boolean>(false);

  currentPage = 1;
  totalRecords = signal<number>(0);
  dbTotalRecords = signal<number>(0);
  jobsGeCount = signal<number>(0);
  hrGeCount = signal<number>(0);
  hasMoreJobs = signal<boolean>(true);

  contactEmail = new FormControl<string>('', {
    validators: [Validators.required, Validators.email],
    nonNullable: true
  });
  contactComment = new FormControl<string>('', {
    validators: [Validators.required],
    nonNullable: true
  });

  // Filter Form Controls
  searchFilter = new FormControl<string>('', { nonNullable: true });
  locationFilter = new FormControl<string>('all', { nonNullable: true });
  locationSearchInput = new FormControl<string>('', { nonNullable: true });
  locationSearch = signal<string>('');
  sourceFilter = new FormControl<string>('all', { nonNullable: true });
  companyFilter = new FormControl<string>('', { nonNullable: true });
  dateRangeFilter = new FormControl<string>('all', { nonNullable: true });
  showAdvancedFilters = signal<boolean>(false);

  isLocationOpen = signal<boolean>(false);
  isDateRangeOpen = signal<boolean>(false);
  showScrollToFilters = signal<boolean>(false);

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

  // Dynamic Vacancies Data
  allJobs = signal<HomeJob[]>([]);
  filteredJobs = signal<HomeJob[]>([]);

  private http = inject(HttpClient);
  private alertify = inject(AlertifyService);
  private searchSub?: any;

  ngOnInit() {
    this.loadJobs();
    this.stateStore.loadCities();

    this.searchSub = this.locationSearchInput.valueChanges.pipe(
      debounceTime(150),
      distinctUntilChanged()
    ).subscribe(val => {
      this.locationSearch.set(val);
    });
  }

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => this.initParticles());
  }

  ngOnDestroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.searchSub) {
      this.searchSub.unsubscribe();
    }
  }

  private initParticles() {
    const canvas = this.particleCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;

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

      // Continuously track bounds during search or burst states to prevent particles disappearing
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
            // Give it dynamic burst velocity so it keeps moving if it resets during the burst interval
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

  loadJobs(query: string = '', append: boolean = false) {
    if (!append) {
      this.currentPage = 1;
      this.isLoading.set(true);
      this.searchState = 'searching';
    } else {
      this.isAppending.set(true);
    }
    const startTime = Date.now();

    const source = this.sourceFilter.value;
    const location = this.locationFilter.value;
    const company = this.companyFilter.value;

    let publishDateParam = 'all';
    const dateRange = this.dateRangeFilter.value;
    if (dateRange !== 'all') {
      const targetDate = new Date();
      if (dateRange === 'yesterday') {
        targetDate.setDate(targetDate.getDate() - 1);
      } else if (dateRange === '3days') {
        targetDate.setDate(targetDate.getDate() - 3);
      } else if (dateRange === '7days') {
        targetDate.setDate(targetDate.getDate() - 7);
      } else if (dateRange === '30days') {
        targetDate.setDate(targetDate.getDate() - 30);
      }
      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
      const day = String(targetDate.getDate()).padStart(2, '0');
      publishDateParam = `${year}-${month}-${day}`;
    }

    const limit = append ? 50 : 30;

    this.jobsService.getJobs(query, this.currentPage, source, location, company, publishDateParam, limit).subscribe({
      next: (res) => {
        const elapsedTime = Date.now() - startTime;
        const minDuration = 800;
        const delay = Math.max(0, minDuration - elapsedTime);

        setTimeout(() => {
          const mapped: HomeJob[] = (res.jobs || []).map((job) => ({
            id: job.id,
            vacancy: job.vacancy,
            company: job.company,
            location: job.location || 'Remote',
            source: this.detectSource(job.link || ''),
            salaryRange: job.salaryRange || 'შეთანხმებით',
            publishDate: this.formatDate(job.publishDate),
            matchScore: job.match || Math.floor(Math.random() * 10) + 90,
            link: job.link || '/jobs'
          }));

          if (append) {
            this.allJobs.update((prev) => [...prev, ...mapped]);
          } else {
            this.allJobs.set(mapped);
          }

          const total = res.counts?.filteredRecords || 0;
          this.totalRecords.set(total);

          const dbTotal = res.counts?.totalRecords || 0;
          this.dbTotalRecords.set(dbTotal);

          const jobsGe = res.counts?.jobsGe || 0;
          this.jobsGeCount.set(jobsGe);

          const hrGe = res.counts?.hrGe || 0;
          this.hrGeCount.set(hrGe);

          this.hasMoreJobs.set(this.allJobs().length < total && mapped.length > 0);

          this.filteredJobs.set(this.allJobs());
          this.isLoading.set(false);
          this.isAppending.set(false);

          if (!append) {
            this.searchState = 'burst';
            setTimeout(() => {
              if (this.searchState === 'burst') {
                this.searchState = 'idle';
              }
            }, 600);
          }
        }, delay);
      },
      error: (err) => {
        console.error('Error fetching jobs:', err);
        this.isLoading.set(false);
        this.isAppending.set(false);
        this.searchState = 'idle';
      }
    });
  }

  loadMore() {
    this.currentPage++;
    this.loadJobs(this.searchFilter.value, true);
  }

  toggleAdvancedFilters() {
    this.showAdvancedFilters.update(v => !v);
  }

  detectSource(link: string): string {
    const l = link.toLowerCase();
    if (l.includes('jobs.ge')) {
      return 'jobs.ge';
    }
    if (l.includes('hr.ge')) {
      return 'hr.ge';
    }
    return 'other';
  }

  formatDate(dateStr: any): string {
    if (!dateStr) return 'დღეს';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return dateStr;
    }
  }

  setSource(source: string) {
    this.sourceFilter.setValue(source);
    this.loadJobs(this.searchFilter.value);
  }

  setPopularSearch(keyword: string) {
    this.companyFilter.setValue(keyword);
    this.searchFilter.setValue('');
    this.loadJobs('');
  }

  clearFilters() {
    this.searchFilter.setValue('');
    this.locationFilter.setValue('all');
    this.locationSearchInput.setValue('');
    this.sourceFilter.setValue('all');
    this.companyFilter.setValue('');
    this.dateRangeFilter.setValue('all');
    this.currentPage = 1;
    this.closeAllDropdowns();
    this.loadJobs('');
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

  toggleLocationDropdown(event: Event) {
    event.stopPropagation();
    this.isLocationOpen.update(v => !v);
    this.isDateRangeOpen.set(false);
  }

  toggleDateRangeDropdown(event: Event) {
    event.stopPropagation();
    this.isDateRangeOpen.update(v => !v);
    this.isLocationOpen.set(false);
  }

  closeAllDropdowns() {
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
      const container = this.searchContainerRef?.nativeElement;
      if (container) {
        const rect = container.getBoundingClientRect();
        // If the bottom of the search container has scrolled past the top of the viewport
        const pastFilters = rect.bottom < 0;
        // Also only show on mobile/tablet (e.g. window.innerWidth <= 768)
        const isMobile = window.innerWidth <= 768;
        this.showScrollToFilters.set(pastFilters && isMobile);
      }
    }
  }

  scrollToFilters() {
    this.searchContainerRef?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  applyJob(link: string) {
    if (this.authService.isLoggedIn()) {
      window.open(link, '_blank');
    } else {
      this.authService.openAuthModal('login');
    }
  }

  scroll(target: string) {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  handleHeroClick() {
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/private/dashboard']);
    } else {
      this.authService.openAuthModal('login');
    }
  }

  handlePlanClick(planKey: string) {
    if (this.authService.isLoggedIn()) {
      this.openUpgradeModal();
    } else {
      this.authService.openAuthModal('register');
    }
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

  sendContactEmail() {
    if (this.contactEmail.invalid || this.contactComment.invalid) {
      this.alertify.error('გთხოვთ შეავსოთ ყველა ველი სწორად');
      return;
    }

    const payload = {
      email: this.contactEmail.value,
      comment: this.contactComment.value
    };

    this.http.post(`${environment.apiUrl}/email/contact`, payload).subscribe({
      next: () => {
        this.alertify.success('შეტყობინება წარმატებით გაიგზავნა');
        this.contactEmail.reset();
        this.contactComment.reset();
      },
      error: (err) => {
        console.error('Error sending contact email:', err);
        this.alertify.error('შეტყობინების გაგზავნისას დაფიქსირდა შეცდომა');
      }
    });
  }
}

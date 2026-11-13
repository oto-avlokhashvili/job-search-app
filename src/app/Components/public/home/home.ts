import { Component, computed, DestroyRef, effect, ElementRef, inject, OnInit, PLATFORM_ID, signal, untracked, ViewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { PublicCvModal } from '../public-cv-modal/public-cv-modal';
import { CompanyLogos } from '../../../Core/Utils/company-logos';
import { JOB_CATEGORIES } from '../../../Core/Utils/job-categories';
import { extractSalary, hasSalary } from '../../../Core/Utils/salary-extractor';
import { generateJobSlug } from '../../../Core/Utils/slug-generator';
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
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../Core/Services/auth-service';
import { WaitlistService } from '../../../Core/Services/waitlist.service';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { environment } from '../../../../environments/environment';
import { StateStore } from '../../../Store/state.store';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionModal } from '../subscription-modal/subscription-modal';
import { WaitlistModal } from '../waitlist-modal/waitlist-modal';
import { JobsService } from '../../../Core/Services/jobs-service';
import { SeoService } from '../../../Core/Services/seo.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterModule, CommonModule, ReactiveFormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  authService = inject(AuthService);
  stateStore = inject(StateStore);
  waitlistService = inject(WaitlistService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private http = inject(HttpClient);
  private alertify = inject(AlertifyService);
  private jobsService = inject(JobsService);
  private seo = inject(SeoService);

  stats = this.stateStore.stats;
  statsLoading = this.stateStore.statsLoading;
  dbTotalRecords = this.stateStore.publicDbTotal;

  // ── Hero ──────────────────────────────────────────────────────
  /** Which side of the hero is open; ?for=employer opens the employer side (for links sent to employers) */
  audience = signal<'seeker' | 'employer'>('seeker');
  vacancyCount = computed(() => this.stats()?.activeVacancies || this.dbTotalRecords());
  /** HR accounts and admins: the employer side offers the HR panel instead of sign-up */
  isEmployerAccount = computed(() => {
    const role = this.stateStore.profile().role;
    return this.authService.isLoggedIn() && (role === 'HR' || role === 'ADMIN');
  });

  searchQuery = new FormControl('', { nonNullable: true });
  /** Every category, as one scrollable row of chips */
  readonly heroCategories = JOB_CATEGORIES;

  // Category row arrows: shown only when the row overflows, each end disabled when reached
  quickCanScrollLeft = signal(false);
  quickCanScrollRight = signal(false);
  private quickTrackEl?: HTMLElement;
  private quickResizeObserver?: ResizeObserver;
  @ViewChild('quickTrack') set quickTrack(ref: ElementRef<HTMLElement> | undefined) {
    // The row is re-created when switching sides; watch the current one
    this.quickResizeObserver?.disconnect();
    this.quickTrackEl = ref?.nativeElement;
    if (!this.quickTrackEl || typeof ResizeObserver === 'undefined') return;
    this.quickResizeObserver = new ResizeObserver(() => this.updateQuickArrows());
    this.quickResizeObserver.observe(this.quickTrackEl);
  }

  updateQuickArrows() {
    const el = this.quickTrackEl;
    if (!el) return;
    // 2px tolerance for sub-pixel scroll positions
    this.quickCanScrollLeft.set(el.scrollLeft > 2);
    this.quickCanScrollRight.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }

  scrollQuick(direction: 1 | -1) {
    const el = this.quickTrackEl;
    el?.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: 'smooth' });
  }

  readonly logos = new CompanyLogos();
  /** The newest vacancies, shown in the seeker preview */
  latestLoading = signal(true);
  latestJobs = signal<{ id: number; slug: string; title: string; company: string; location: string; logo: string | null; salary: string; age: string }[]>([]);

  /** The employer preview is an illustration of the HR search, so its candidates are made up and anonymous */
  readonly sampleCandidates = [
    { initials: 'ნბ', name: 'ნ. ბ.', role: 'მთავარი ბუღალტერი · 6 წელი', match: 94, stage: 'ახალი', color: '#6366f1' },
    { initials: 'გმ', name: 'გ. მ.', role: 'ბუღალტერი · 4 წელი', match: 89, stage: 'გასაუბრება', color: '#0ea5e9' },
    { initials: 'ლკ', name: 'ლ. კ.', role: 'ბუღალტრის ასისტენტი · 2 წელი', match: 81, stage: '', color: '#f59e0b' },
  ];

  /** The employer preview "runs" the AI search: a short load before the candidates show, like the seeker side */
  candidatesLoading = signal(false);
  private candidatesTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(ActivatedRoute).queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.audience.set(params.get('for') === 'employer' ? 'employer' : 'seeker');
    });

    // Browser only: the server renders the candidates straight away
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      effect(() => {
        if (this.audience() !== 'employer') return;
        untracked(() => {
          clearTimeout(this.candidatesTimer);
          this.candidatesLoading.set(true);
          this.candidatesTimer = setTimeout(() => this.candidatesLoading.set(false), 900);
        });
      });
      inject(DestroyRef).onDestroy(() => {
        clearTimeout(this.candidatesTimer);
        this.quickResizeObserver?.disconnect();
      });
    }
  }

  /** Keeps the side in the URL, so a shared link opens the same side; no history entry per click */
  setAudience(audience: 'seeker' | 'employer') {
    this.audience.set(audience);
    this.router.navigate([], {
      queryParams: { for: audience === 'employer' ? 'employer' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
      scroll: 'manual',
    });
  }

  search(event: Event) {
    event.preventDefault();
    const search = this.searchQuery.value.trim();
    this.router.navigate(['/vacancies'], { queryParams: { search: search || null } });
  }

  /**
   * Hot vacancies for the seeker preview: the newest two from TBC and two from Bank of Georgia,
   * alternating (their company pages use these keys). Falls back to the newest jobs.ge vacancies.
   */
  private async loadLatestJobs() {
    const companyJobs = (key: string) =>
      firstValueFrom(this.jobsService.getCompanyJobs(key, 1, 2)).then((res) => res.jobs || []).catch(() => [] as Job[]);
    try {
      const [tbcJobs, bogJobs] = await Promise.all([companyJobs('თიბისი'), companyJobs('საქართველოსბანკი')]);
      // The banks' own icons from /public/icons, sharper than the scraped logos
      const bankIcon = new Map<number, string>([
        ...tbcJobs.map((job): [number, string] => [job.id, '/icons/tbc.jpg']),
        ...bogJobs.map((job): [number, string] => [job.id, '/icons/bog.png']),
      ]);
      let jobs: Job[] = [tbcJobs[0], bogJobs[0], tbcJobs[1], bogJobs[1]].filter((job): job is Job => !!job);
      if (jobs.length === 0) {
        jobs = (await firstValueFrom(this.jobsService.getJobs('', 1, 'jobs.ge', 'all', '', 'all', 4))).jobs || [];
      }
      this.latestJobs.set(
        jobs.map((job) => {
          const salary = extractSalary(job);
          return {
            id: job.id,
            slug: generateJobSlug(job.vacancy, job.company, job.id),
            title: job.vacancy,
            company: job.company,
            location: (job.location || '').replace(/,?\s*(georgia|საქართველო)\s*$/i, '').trim() || job.location,
            logo: bankIcon.get(job.id) ?? job.companyLogo ?? null,
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

  openPublicCvModal() {
    this.dialog.open(PublicCvModal, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'public-cv-dialog',
      autoFocus: false,
    });
  }

  contactEmail = new FormControl<string>('', {
    validators: [Validators.required, Validators.email],
    nonNullable: true
  });
  contactComment = new FormControl<string>('', {
    validators: [Validators.required],
    nonNullable: true
  });

  ngOnInit() {
    this.seo.update({
      title: 'Job Up — დასაქმდი ან დაასაქმე',
      description: 'ყველა აქტიური ვაკანსია ერთ სივრცეში — დამსაქმებლებისთვის კი AI კანდიდატების ძიება და შერჩევა.',
      path: '/home',
    });
    this.loadLatestJobs();
  }

  /**
   * "დაასაქმე": HR accounts (and admins) go to the HR panel; visitors get employer sign-up with the
   * employer option already ticked. A job seeker's account can't hire, so they're told how instead.
   */
  async openEmployerPath() {
    if (!this.authService.isLoggedIn()) {
      this.authService.openAuthModal('register', '/hr', true);
      return;
    }
    await this.stateStore.loadProfile();
    const role = this.stateStore.profile().role;
    if (role === 'HR' || role === 'ADMIN') {
      this.router.navigate(['/hr']);
    } else {
      this.alertify.warning('დასაქმებისთვის საჭიროა დამსაქმებლის ანგარიში. გამოდით და დარეგისტრირდით როგორც დამსაქმებელი.');
    }
  }

  joinProWaitlist() {
    if (this.waitlistService.isEnrolled('PRO')) {
      this.alertify.success('თქვენ უკვე დარეგისტრირებული ხართ Pro პაკეტის Waitlist-ში! 🎉');
      return;
    }
    this.dialog.open(WaitlistModal, {
      width: '480px',
      maxWidth: '95vw',
      panelClass: 'waitlist-dialog',
      disableClose: false,
      autoFocus: false,
      data: { plan: 'PRO', source: 'landing_pricing' }
    });
  }

  joinEnterpriseWaitlist() {
    if (this.waitlistService.isEnrolled('ENTERPRISE')) {
      this.alertify.success('თქვენ უკვე დარეგისტრირებული ხართ Enterprise Waitlist-ში! 🎉');
      return;
    }
    this.dialog.open(WaitlistModal, {
      width: '480px',
      maxWidth: '95vw',
      panelClass: 'waitlist-dialog',
      disableClose: false,
      autoFocus: false,
      data: { plan: 'ENTERPRISE', source: 'landing_enterprise_card' }
    });
  }

  handlePlanClick(planKey: string) {
    if (planKey === 'PRO') {
      this.joinProWaitlist();
      return;
    }
    if (planKey === 'PREMIUM' || planKey === 'ENTERPRISE') {
      this.joinEnterpriseWaitlist();
      return;
    }
    if (this.authService.isLoggedIn()) {
      this.openUpgradeModal();
    } else {
      this.authService.openAuthModal('register');
    }
  }

  openUpgradeModal() {
    this.dialog.open(SubscriptionModal, {
      width: '960px',
      maxWidth: '96vw',
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

  scroll(target: string) {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

import { CompanyLogos } from '../../../Core/Utils/company-logos';
import { Component, DestroyRef, ElementRef, afterNextRender, inject, OnInit, computed, effect, signal, untracked, PLATFORM_ID, RESPONSE_INIT } from '@angular/core';
import { CommonModule, Location, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Job, VacancyItem } from '../../../Core/Interfaces/jobs';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { AuthService } from '../../../Core/Services/auth-service';
import { extractApplyUrl } from '../../../Core/Utils/apply-url';
import { descriptionExcerpt } from '../../../Core/Utils/description-excerpt';
import { StateStore, detectJobSource, formatJobDate, isJobUpJob, JOBUP_LOGO } from '../../../Store/state.store';
import { extractSalary } from '../../../Core/Utils/salary-extractor';
import { generateJobSlug, extractJobIdFromSlug } from '../../../Core/Utils/slug-generator';
import { PublicCvModal } from '../public-cv-modal/public-cv-modal';
import { SeoService, SITE_URL } from '../../../Core/Services/seo.service';
import { buildJobBreadcrumbSchema, buildJobPostingSchema } from '../../../Core/Utils/job-schema';
import { findCityLanding } from '../../../Core/Utils/landing-pages';
import { FavoriteButton } from '../../shared/favorite-button/favorite-button';
import { QuickApplyModal, QuickApplyModalData, QuickApplyModalResult } from '../quick-apply-modal/quick-apply-modal';
import { QuickApplyService } from '../../../Core/Services/quick-apply';
import { hasQuickApplied, quickApplyEmail, rememberQuickApplied } from '../../../Core/Utils/quick-apply-storage';

@Component({
  selector: 'app-vacancy-details',
  standalone: true,
  imports: [CommonModule, RouterModule, FavoriteButton],
  templateUrl: './vacancy-details.html',
  styleUrl: './vacancy-details.scss'
})
export class VacancyDetails implements OnInit {
  public alertify = inject(AlertifyService);
  public authService = inject(AuthService);
  public stateStore = inject(StateStore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private seo = inject(SeoService);
  // Only provided during SSR; lets us answer missing jobs with a real 404.
  private responseInit = inject(RESPONSE_INIT, { optional: true });
  private dialog = inject(MatDialog);
  private quickApplyService = inject(QuickApplyService);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroyRef = inject(DestroyRef);

  /** The description card has reached the top of the screen: the floating apply pill shows */
  floatApplyVisible = signal(false);

  /** Quick apply: the address the API found in the description (null = apply on the source site). */
  applyEmail = computed(() => quickApplyEmail(this.stateStore.selectedJob()));
  /**
   * Where the vacancy takes applications by hand. A LinkedIn posting's own link; else the application
   * link in the description (Helio, Google Forms, a careers page...); else the original posting.
   * null = none found.
   */
  applyUrl = computed(() => {
    const job = this.stateStore.selectedJob();
    if (!job) return null;
    const outside = !this.isJobUp(job) && this.hasOutsideLink(job) ? job.link : null;
    if (outside && /linkedin\.com/i.test(outside)) return outside;
    return extractApplyUrl(`${job.description || ''} ${job.requirements || ''}`) ?? outside;
  });
  /** The one apply button: any imported vacancy, and Job Up's own when they name an address */
  showApply = computed(() => {
    const job = this.stateStore.selectedJob();
    return !!job && (!!this.applyEmail() || !this.isJobUp(job));
  });
  /** This visitor already sent their CV to this vacancy */
  applied = signal(false);

  // Accordion & Discovery Hook State
  isAccordionOpen = signal<boolean>(false);
  similarJobs = signal<VacancyItem[]>([]);
  similarJobsLoading = signal<boolean>(false);
  similarJobsLoaded = signal<boolean>(false);
  suggestedTags = signal<{ label: string; query: string; type: 'role' | 'company' | 'location' }[]>([]);

  cityLanding = computed(() => findCityLanding(this.stateStore.selectedJob()?.location));

  totalVacanciesCount = computed(() => {
    const statsCount = this.stateStore.stats()?.activeVacancies;
    if (statsCount && statsCount > 0) return statsCount;
    const dbCount = this.stateStore.publicDbTotal();
    if (dbCount && dbCount > 0) return dbCount;
    const totalCount = this.stateStore.publicJobsTotal();
    if (totalCount && totalCount > 0) return totalCount;
    return 4850;
  });

  formattedTotalCount = computed(() => {
    const total = this.totalVacanciesCount();
    return total ? total.toLocaleString('en-US') : '4,850+';
  });


  extractedEmail = computed(() => {
    const job = this.stateStore.selectedJob();
    if (!job) return null;

    // The API's pick: cut where the address really ends, without the job sites' own or data-protection ones
    if (job.applyEmail != null) return job.applyEmail || null;

    if ((job as any).email && typeof (job as any).email === 'string') {
      return (job as any).email;
    }

    const textToSearch = `${job.description || ''} ${job.requirements || ''}`;
    const match = textToSearch.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    return match ? match[1] : null;
  });

  extractedSalary = computed(() => {
    const job = this.stateStore.selectedJob();
    return extractSalary(job);
  });

  // Returned as a plain string so [innerHTML] runs it through Angular's sanitizer:
  // descriptions come from scraped portals and logged-in users, so they're untrusted.
  formattedDescription = computed<string | null>(() => {
    const job = this.stateStore.selectedJob();
    if (!job) return null;

    const raw = (job.description && job.description.trim().length > 0)
      ? job.description
      : (job.requirements && job.requirements.trim().length > 0)
        ? job.requirements
        : null;

    if (!raw) return null;

    // Imported vacancies: an excerpt only, the full text is on the original posting (see the footer)
    return this.formatDescriptionText(this.isJobUp(job) ? raw : descriptionExcerpt(raw));
  });

  /** The portal an imported vacancy came from, for the credit line ('jobs.ge', 'LinkedIn', ...) */
  sourceName = computed(() => {
    const job = this.stateStore.selectedJob();
    if (!job || this.isJobUp(job)) return null;
    const source = detectJobSource(job.source, job.link, job.company);
    if (source === 'linkedin') return 'LinkedIn';
    return source === 'other' ? null : source;
  });

  /** The original posting the vacancy was imported from */
  originalLink = computed(() => {
    const job = this.stateStore.selectedJob();
    return job && !this.isJobUp(job) && this.hasOutsideLink(job) ? job.link : null;
  });

  private formatDescriptionText(text: string): string {
    if (!text) return '';

    // Check if the text already contains rich HTML tags
    const hasHtmlTags = /<\s*(p|br|div|ul|ol|li|table|tr|td|h[1-6]|strong|b|em|span)\b[^>]*>/i.test(text);

    if (hasHtmlTags) {
      // Clean up hardcoded colors/backgrounds from scraped HTML so it adapts to dark/light theme
      let cleanHtml = text
        .replace(/style="([^"]*)"/gi, (match, styleContent) => {
          const cleaned = styleContent
            .replace(/color\s*:\s*[^;"]+;?/gi, '')
            .replace(/background(-color)?\s*:\s*[^;"]+;?/gi, '')
            .replace(/font-family\s*:\s*[^;"]+;?/gi, '')
            .replace(/font-size\s*:\s*[^;"]+;?/gi, '')
            .trim();
          return cleaned.length > 0 ? `style="${cleaned}"` : '';
        })
        .replace(/color="[^"]*"/gi, '')
        .replace(/bgcolor="[^"]*"/gi, '')
        .replace(/<font[^>]*>/gi, '')
        .replace(/<\/font>/gi, '');

      cleanHtml = this.linkifyAndCleanText(cleanHtml, true);
      return cleanHtml;
    }

    // Plain text parser: preserve formatting, bullets, headers, spacing
    const normalized = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();

    const lines = normalized.split('\n');
    const result: string[] = [];
    let inList = false;
    let listType: 'ul' | 'ol' = 'ul';

    const bulletRegex = /^(\s*)([•*–—\-✓✔▪▫+●]|\d+[\.\)])\s*(.+)$/;
    const headerRegex = /^(\s*)(ძირითადი მოვალეობები|მოვალეობები|მოთხოვნები|საკვალიფიკაციო მოთხოვნები|პიროვნული თვისებები|სამუშაო პირობები|რას გთავაზობთ|გთავაზობთ|ანაზღაურება|დამატებითი ინფორმაცია|საკონტაქტო ინფორმაცია|Job Description|Responsibilities|Requirements|Qualifications|We Offer|About Company|Contact):?\s*$/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) {
        if (inList) {
          result.push(`</${listType}>`);
          inList = false;
        }
        continue;
      }

      // Check for bullet items
      const bulletMatch = line.match(bulletRegex);
      if (bulletMatch) {
        const bulletMarker = bulletMatch[2];
        const itemContent = bulletMatch[3];
        const isNumeric = /^\d+[\.\)]/.test(bulletMarker);
        const currentListType = isNumeric ? 'ol' : 'ul';

        if (!inList) {
          listType = currentListType;
          result.push(`<${listType} class="formatted-bullet-list">`);
          inList = true;
        } else if (listType !== currentListType) {
          result.push(`</${listType}>`);
          listType = currentListType;
          result.push(`<${listType} class="formatted-bullet-list">`);
        }

        result.push(`<li>${this.linkifyAndCleanText(itemContent, false)}</li>`);
        continue;
      }

      // If we were in a list and this line is not a bullet item
      if (inList) {
        result.push(`</${listType}>`);
        inList = false;
      }

      // Check for section headers
      if (headerRegex.test(line) || (line.endsWith(':') && line.length < 80)) {
        result.push(`<h3 class="formatted-section-heading">${this.linkifyAndCleanText(line, false)}</h3>`);
      } else {
        result.push(`<p class="formatted-paragraph">${this.linkifyAndCleanText(line, false)}</p>`);
      }
    }

    if (inList) {
      result.push(`</${listType}>`);
    }

    return result.join('');
  }

  private linkifyAndCleanText(str: string, isHtml: boolean = false): string {
    if (!str) return '';

    let content = str;

    // If not already HTML, escape raw <, >, & first (but preserve markdown syntax)
    if (!isHtml) {
      content = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // 1. Process Markdown links: [Label](URL) or [URL](URL)
    content = content.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g,
      (match, label, rawUrl) => {
        const { url } = this.stripTrailingPunctuation(rawUrl);
        const cleanLabel = label.trim();
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="formatted-web-link">${cleanLabel}</a>`;
      }
    );

    // 2. Process Markdown bold **text**
    if (!isHtml) {
      content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }

    // 3. Auto-link email addresses (avoid if already inside href)
    content = content.replace(
      /(?<!href=["']mailto:)(?<!href=["'])\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi,
      '<a href="mailto:$1" class="formatted-email-link">$1</a>'
    );

    // 4. Auto-link bare URLs (not already inside <a href="...">)
    content = content.replace(
      /(?<!href=["'])(https?:\/\/[^\s<>"']+)/gi,
      (match, rawUrl) => {
        const { url, trailing } = this.stripTrailingPunctuation(rawUrl);
        if (!url) return rawUrl;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="formatted-web-link">${url}</a>${trailing}`;
      }
    );

    // 5. Clean up redundant duplicate adjacent links like:
    // <a href="url">url</a> (<a href="url">url</a>) -> <a href="url">url</a>
    // or <a href="url">label</a> (url) -> <a href="url">label</a>
    content = content.replace(
      /(<a\s+href="([^"]+)"[^>]*>[^<]+<\/a>)\s*\(\s*<a\s+href="\2"[^>]*>[^<]+<\/a>\s*\)/gi,
      '$1'
    );
    content = content.replace(
      /(<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>)\s*\(\s*\2\s*\)/gi,
      '$1'
    );
    content = content.replace(
      /(<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>)\s*\(\s*<a\s+href="[^"]*"[^>]*>\2<\/a>\s*\)/gi,
      '$1'
    );

    return content;
  }

  private stripTrailingPunctuation(rawUrl: string): { url: string; trailing: string } {
    let url = rawUrl.trim();
    let trailing = '';

    while (url.length > 0) {
      const lastChar = url.slice(-1);

      if (lastChar === ')') {
        const openParenCount = (url.match(/\(/g) || []).length;
        const closeParenCount = (url.match(/\)/g) || []).length;
        if (closeParenCount > openParenCount) {
          trailing = lastChar + trailing;
          url = url.slice(0, -1);
          continue;
        }
      }

      if (lastChar === ']') {
        const openBracketCount = (url.match(/\[/g) || []).length;
        const closeBracketCount = (url.match(/\]/g) || []).length;
        if (closeBracketCount > openBracketCount) {
          trailing = lastChar + trailing;
          url = url.slice(0, -1);
          continue;
        }
      }

      if (/[.,;:!?'"\\>]/.test(lastChar)) {
        trailing = lastChar + trailing;
        url = url.slice(0, -1);
        continue;
      }

      break;
    }

    return { url, trailing };
  }

  constructor() {
    // Browser only: the pill shows once the description card's top has scrolled up to just under the
    // fixed header (72px). The card renders after the job loads, so it's looked up on each check.
    afterNextRender(() => {
      let frame = 0;
      const check = () => {
        frame = 0;
        const card = this.host.nativeElement.querySelector('.vacancy-body-section');
        this.floatApplyVisible.set(!!card && card.getBoundingClientRect().top <= 72 + 24);
      };
      const onScroll = () => {
        if (!frame) frame = requestAnimationFrame(check);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        if (frame) cancelAnimationFrame(frame);
      });
      check();
    });

    effect(() => {
      const job = this.stateStore.selectedJob();
      if (job) {
        this.extractKeywordsAndTags(job);
        this.applySeo(job);
      }
    });

    // "Sent" state: this browser's record first, then the account's
    effect(() => {
      const jobId = this.stateStore.selectedJob()?.id;
      const loggedIn = this.authService.isLoggedIn();
      untracked(() => this.loadAppliedState(jobId, loggedIn));
    });

    effect(() => {
      if (this.stateStore.selectedJobError()) {
        // 404 only when the backend says the job doesn't exist; a timeout or backend
        // error gets 503 so Google retries instead of dropping the page.
        const notFound = this.stateStore.selectedJobErrorStatus() === 404;
        this.seo.update({
          title: 'ვაკანსია ვერ მოიძებნა | Job Up',
          description: 'ვაკანსია ვერ მოიძებნა ან აღარ არის აქტიური. იხილეთ სხვა აქტიური ვაკანსიები Job Up-ზე.',
          path: '/vacancies',
          noindex: true,
        });
        if (this.responseInit) {
          this.responseInit.status = notFound ? 404 : 503;
        }
      }
    });
  }

  private applySeo(job: Job) {
    const path = `/vacancies/${generateJobSlug(job.vacancy, job.company, job.id)}`;
    const pageUrl = SITE_URL + path;
    const location = job.location || 'საქართველო';

    this.seo.update({
      title: `${job.vacancy} — ${job.company} | ვაკანსია | Job Up`,
      description: `${job.company} აცხადებს ვაკანსიას: ${job.vacancy}. ლოკაცია: ${location}. გაეცანით მოთხოვნებს და გააგზავნეთ CV Job Up-ზე.`,
      path,
      type: 'article',
    });

    const posting = buildJobPostingSchema(job, pageUrl, this.isJobUp(job));
    if (posting) {
      this.seo.addJsonLd(posting);
    }
    this.seo.addJsonLd(buildJobBreadcrumbSchema(job, pageUrl, findCityLanding(job.location)));
  }

  ngOnInit() {
    this.stateStore.loadStats();
    // Portal counts for the accordion are loaded globally (App).

    this.route.paramMap.subscribe(params => {
      const slug = params.get('slug');
      if (slug) {
        const jobId = extractJobIdFromSlug(slug);
        if (jobId) {
          this.stateStore.loadJobById(jobId);
        } else {
          this.router.navigate(['/vacancies']);
        }
      }
    });
  }

  toggleAccordion() {
    this.isAccordionOpen.update(v => !v);
  }

  private extractKeywordsAndTags(job: Job) {
    if (!job) return;

    const rawTitle = job.vacancy || '';
    let cleanTitle = rawTitle
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/[-–—/\\|:]/g, ' ')
      .replace(/\b(senior|junior|lead|middle|head of|intern|სენიორ|ჯუნიორ|მენეჯერი|სპეციალისტი)\b/gi, '')
      .trim();

    const words = cleanTitle.split(/\s+/).filter(w => w.length > 2);
    const primaryQuery = words.slice(0, 2).join(' ') || rawTitle.split(/\s+/)[0] || '';

    const tags: { label: string; query: string; type: 'role' | 'company' | 'location' }[] = [];
    
    if (primaryQuery) {
      tags.push({ label: `🔍 ${primaryQuery}`, query: primaryQuery, type: 'role' });
    }
    if (job.company) {
      tags.push({ label: `🏢 ${job.company}`, query: job.company, type: 'company' });
    }
    if (job.location && job.location.toLowerCase() !== 'all' && job.location.toLowerCase() !== 'remote') {
      tags.push({ label: `📍 ${job.location}`, query: job.location, type: 'location' });
    }
    tags.push({ label: `💻 დისტანციური`, query: 'Remote', type: 'location' });

    this.suggestedTags.set(tags);

    const searchQuery = primaryQuery || job.company;
    if (searchQuery) {
      this.fetchSimilarJobs(searchQuery, job.id);
    }
  }

  private fetchSimilarJobs(query: string, currentJobId: number | string) {
    this.similarJobsLoading.set(true);
    this.stateStore.loadSimilarJobs(query).then(
      (found) => {
        const jobs = found
          .filter((j: Job) => String(j.id) !== String(currentJobId))
          .slice(0, 4)
          .map((j: Job) => ({
            id: j.id,
            vacancy: j.vacancy,
            company: j.company,
            location: j.location || 'Remote',
            source: detectJobSource(j.source || '', j.link || '', j.company),
            salaryRange: extractSalary(j),
            publishDate: formatJobDate(j.publishDate),
            deadline: j.deadline ? formatJobDate(j.deadline) : '',
            matchScore: j.match || 95,
            link: j.link || '/jobs',
            companyLogo: j.companyLogo ?? null,
          }));
        this.similarJobs.set(jobs);
        this.similarJobsLoading.set(false);
        this.similarJobsLoaded.set(true);
      },
      () => {
        this.similarJobsLoading.set(false);
        this.similarJobsLoaded.set(true);
      },
    );
  }

  navigateToTag(tag: { label: string; query: string; type: 'role' | 'company' | 'location' }) {
    if (tag.type === 'location') {
      this.router.navigate(['/vacancies'], { queryParams: { location: tag.query } });
    } else {
      this.router.navigate(['/vacancies'], { queryParams: { search: tag.query } });
    }
  }

  navigateToAllVacancies(query?: string) {
    if (query) {
      this.router.navigate(['/vacancies'], { queryParams: { search: query } });
    } else {
      this.router.navigate(['/vacancies']);
    }
  }

  getJobSlug(item: VacancyItem): string {
    return generateJobSlug(item.vacancy, item.company, item.id);
  }

  copyEmail(email: string) {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(email).then(() => {
        this.alertify.success('ელ-ფოსტა დაკოპირდა: ' + email);
      }).catch(() => {
        this.alertify.error('ელ-ფოსტის დაკოპირება ვერ მოხერხდა');
      });
    }
  }

  goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/vacancies']);
    }
  }

  copyLink() {
    const job = this.stateStore.selectedJob();
    if (job && typeof window !== 'undefined') {
      const slug = generateJobSlug(job.vacancy, job.company, job.id);
      const fullUrl = `${window.location.origin}/vacancies/${slug}`;
      navigator.clipboard.writeText(fullUrl).then(() => {
        this.alertify.success('ვაკანსიის ბმული დაკოპირდა');
      }).catch(() => {
        this.alertify.error('ბმულის დაკოპირება ვერ მოხერხდა');
      });
    } else {
      this.alertify.warning('ბმული ხელმისაწვდომი არ არის');
    }
  }

  /** The vacancy has a real link to its original posting ('/jobs' is the list's placeholder) */
  hasOutsideLink(job: { link?: string | null }): boolean {
    return !!job.link && job.link !== '/jobs';
  }

  private loadAppliedState(jobId: number | undefined, loggedIn: boolean) {
    if (!this.isBrowser || !jobId) {
      this.applied.set(false);
      return;
    }
    this.applied.set(hasQuickApplied(jobId));
    if (loggedIn && !this.applied()) {
      this.quickApplyService.applied([jobId]).subscribe({
        next: ({ jobIds }) => {
          if (jobIds.includes(jobId) && this.stateStore.selectedJob()?.id === jobId) {
            rememberQuickApplied(jobId);
            this.applied.set(true);
          }
        },
        error: () => undefined,
      });
    }
  }

  /**
   * The one apply button opens the apply modal: quick send or send by hand when the vacancy names an
   * address; otherwise leave the CV in the candidate pool or apply by hand on the application page.
   */
  apply() {
    const job = this.stateStore.selectedJob();
    if (!job) return;
    const data: QuickApplyModalData = {
      job: { id: job.id, vacancy: job.vacancy, company: job.company, link: job.link },
      email: this.applyEmail(),
      applyUrl: this.applyUrl(),
    };
    this.dialog
      .open(QuickApplyModal, { width: '600px', maxWidth: '95vw', panelClass: 'public-cv-dialog', autoFocus: false, data })
      .afterClosed()
      .subscribe((result: QuickApplyModalResult) => {
        if (result === 'pool') this.openPublicCvModal();
        else if (result && this.stateStore.selectedJob()?.id === job.id) this.applied.set(true);
      });
  }

  openPublicCvModal() {
    this.dialog.open(PublicCvModal, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'public-cv-dialog',
      autoFocus: false,
    });
  }

  readonly jobUpLogo = JOBUP_LOGO;
  readonly logos = new CompanyLogos();

  isJobUp(job: { source?: string; link?: string; company?: string }): boolean {
    return isJobUpJob(job.source, job.link, job.company);
  }

  formatDate(dateStr: any): string {
    return formatJobDate(dateStr);
  }
}

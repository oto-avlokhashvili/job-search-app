import { Component, inject, OnInit, computed, effect, signal, RESPONSE_INIT, PLATFORM_ID } from '@angular/core';
import { CommonModule, Location, isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Job, VacancyItem } from '../../../Core/Interfaces/jobs';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { AuthService } from '../../../Core/Services/auth-service';
import { JobsService } from '../../../Core/Services/jobs-service';
import { StateStore, detectJobSource, formatJobDate, isJobUpJob, JOBUP_LOGO } from '../../../Store/state.store';
import { extractSalary } from '../../../Core/Utils/salary-extractor';
import { generateJobSlug, extractJobIdFromSlug } from '../../../Core/Utils/slug-generator';
import { PublicCvModal } from '../public-cv-modal/public-cv-modal';
import { SeoService, SITE_URL } from '../../../Core/Services/seo.service';
import { buildJobBreadcrumbSchema, buildJobPostingSchema } from '../../../Core/Utils/job-schema';
import { findCityLanding } from '../../../Core/Utils/landing-pages';

@Component({
  selector: 'app-vacancy-details',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './vacancy-details.html',
  styleUrl: './vacancy-details.scss'
})
export class VacancyDetails implements OnInit {
  public alertify = inject(AlertifyService);
  public authService = inject(AuthService);
  public stateStore = inject(StateStore);
  private jobsService = inject(JobsService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private seo = inject(SeoService);
  // Only provided during SSR; lets us answer missing jobs with a real 404.
  private responseInit = inject(RESPONSE_INIT, { optional: true });
  private dialog = inject(MatDialog);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

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

  jobsGeCount = computed(() => this.stateStore.publicJobsGeCount() || 1450);
  hrGeCount = computed(() => this.stateStore.publicHrGeCount() || 980);
  aworkGeCount = computed(() => this.stateStore.publicAworkGeCount() || 620);
  myjobsGeCount = computed(() => this.stateStore.publicMyjobsGeCount() || 410);

  extractedEmail = computed(() => {
    const job = this.stateStore.selectedJob();
    if (!job) return null;
    
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

  formattedDescription = computed<SafeHtml | null>(() => {
    const job = this.stateStore.selectedJob();
    if (!job) return null;

    const raw = (job.description && job.description.trim().length > 0)
      ? job.description
      : (job.requirements && job.requirements.trim().length > 0)
        ? job.requirements
        : null;

    if (!raw) return null;

    const formattedHtml = this.formatDescriptionText(raw);
    return this.sanitizer.bypassSecurityTrustHtml(formattedHtml);
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
        .replace(/>/g, '&gt;');
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
    effect(() => {
      const job = this.stateStore.selectedJob();
      if (job) {
        this.extractKeywordsAndTags(job);
        this.applySeo(job);
      }
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
    // Only feeds the portal counts in the collapsed accordion, so don't make the
    // server render wait for it.
    if (this.isBrowser && !this.stateStore.publicJobsLoaded()) {
      this.stateStore.loadPublicJobs();
    }

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
    this.jobsService.getJobs(query, 1, 'all', 'all', '', 'all', 6).subscribe({
      next: (res) => {
        const jobs = (res.jobs || [])
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
            link: j.link || '/jobs'
          }));
        this.similarJobs.set(jobs);
        this.similarJobsLoading.set(false);
        this.similarJobsLoaded.set(true);
      },
      error: () => {
        this.similarJobsLoading.set(false);
        this.similarJobsLoaded.set(true);
      }
    });
  }

  navigateToTag(tag: { label: string; query: string; type: 'role' | 'company' | 'location' }) {
    if (tag.type === 'location') {
      this.router.navigate(['/vacancies'], { queryParams: { location: tag.query } });
    } else {
      this.router.navigate(['/vacancies'], { queryParams: { search: tag.query } });
    }
  }

  navigateToSource(source: string) {
    this.router.navigate(['/vacancies'], { queryParams: { source } });
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

  openOriginalSource(link?: string) {
    const targetLink = link || this.stateStore.selectedJob()?.link;
    if (targetLink && targetLink !== '/jobs') {
      if (typeof window !== 'undefined') {
        window.open(targetLink, '_blank');
      }
    } else {
      this.alertify.warning('ორიგინალი ბმული ხელმისაწვდომი არ არის');
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

  readonly jobUpLogo = JOBUP_LOGO;

  detectSource(sourceOrLink?: string, linkFallback?: string, company?: string): string {
    return detectJobSource(sourceOrLink, linkFallback, company);
  }

  isJobUp(job: { source?: string; link?: string; company?: string }): boolean {
    return isJobUpJob(job.source, job.link, job.company);
  }

  formatDate(dateStr: any): string {
    return formatJobDate(dateStr);
  }
}

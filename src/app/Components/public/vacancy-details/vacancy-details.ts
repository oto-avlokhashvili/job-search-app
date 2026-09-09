import { Component, inject, OnInit, computed, effect } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { DomSanitizer, SafeHtml, Title, Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Job } from '../../../Core/Interfaces/jobs';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { AuthService } from '../../../Core/Services/auth-service';
import { StateStore } from '../../../Store/state.store';
import { extractSalary } from '../../../Core/Utils/salary-extractor';
import { generateJobSlug, extractJobIdFromSlug } from '../../../Core/Utils/slug-generator';

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
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private titleService = inject(Title);
  private metaService = inject(Meta);

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
      if (job && typeof document !== 'undefined') {
        this.titleService.setTitle(`${job.vacancy} - ${job.company} | Job Up`);
        this.metaService.updateTag({ 
          name: 'description', 
          content: `${job.company} აცხადებს ვაკანსიას პოზიციაზე: ${job.vacancy}. ლოკაცია: ${job.location || 'საქართველო'}` 
        });
      }
    });
  }

  ngOnInit() {
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

  detectSource(sourceOrLink?: string, linkFallback?: string): string {
    const l = `${sourceOrLink || ''} ${linkFallback || ''}`.toLowerCase();
    if (l.includes('myjobs.ge') || l.includes('myjobs') || l.includes('myjob')) return 'myjobs.ge';
    if (l.includes('jobs.ge') || l.includes('jobsge')) return 'jobs.ge';
    if (l.includes('hr.ge') || l.includes('hrge')) return 'hr.ge';
    if (l.includes('awork.ge') || l.includes('awork')) return 'awork.ge';
    return 'სხვა წყარო';
  }

  formatDate(dateStr: any): string {
    if (!dateStr) return 'მითითებული არ არის';
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
}

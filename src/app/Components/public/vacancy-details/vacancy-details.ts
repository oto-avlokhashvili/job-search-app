import { Component, Inject, inject, OnInit, Optional, computed, SecurityContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Job } from '../../../Core/Interfaces/jobs';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { AuthService } from '../../../Core/Services/auth-service';
import { StateStore } from '../../../Store/state.store';

import { extractSalary } from '../../../Core/Utils/salary-extractor';

@Component({
  selector: 'app-vacancy-details',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './vacancy-details.html',
  styleUrl: './vacancy-details.scss'
})
export class VacancyDetails implements OnInit {
  public alertify = inject(AlertifyService);
  public authService = inject(AuthService);
  public stateStore = inject(StateStore);
  private sanitizer = inject(DomSanitizer);

  extractedEmail = computed(() => {
    const job = this.stateStore.selectedJob() || this.data?.job;
    if (!job) return null;
    
    if ((job as any).email && typeof (job as any).email === 'string') {
      return (job as any).email;
    }

    const textToSearch = `${job.description || ''} ${job.requirements || ''}`;
    const match = textToSearch.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    return match ? match[1] : null;
  });

  extractedSalary = computed(() => {
    const job = this.stateStore.selectedJob() || this.data?.job;
    return extractSalary(job);
  });

  formattedDescription = computed<SafeHtml | null>(() => {
    const job = this.stateStore.selectedJob() || this.data?.job;
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

        result.push(`<li>${this.escapeAndLinkify(itemContent)}</li>`);
        continue;
      }

      // If we were in a list and this line is not a bullet item
      if (inList) {
        result.push(`</${listType}>`);
        inList = false;
      }

      // Check for section headers
      if (headerRegex.test(line) || (line.endsWith(':') && line.length < 80)) {
        result.push(`<h3 class="formatted-section-heading">${this.escapeAndLinkify(line)}</h3>`);
      } else {
        result.push(`<p class="formatted-paragraph">${this.escapeAndLinkify(line)}</p>`);
      }
    }

    if (inList) {
      result.push(`</${listType}>`);
    }

    return result.join('');
  }

  private escapeAndLinkify(str: string): string {
    if (!str) return '';
    // Basic entity escaping
    let escaped = str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Auto-link email addresses
    escaped = escaped.replace(
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      '<a href="mailto:$1" class="formatted-email-link">$1</a>'
    );

    // Auto-link URLs
    escaped = escaped.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="formatted-web-link">$1</a>'
    );

    return escaped;
  }

  constructor(
    @Optional() public dialogRef?: MatDialogRef<VacancyDetails>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data?: { jobId: number | string; job?: Job }
  ) {}

  ngOnInit() {
    if (this.data?.jobId) {
      this.stateStore.loadJobById(this.data.jobId);
    }
  }

  copyEmail(email: string) {
    navigator.clipboard.writeText(email).then(() => {
      this.alertify.success('ელ-ფოსტა დაკოპირდა: ' + email);
    }).catch(() => {
      this.alertify.error('ელ-ფოსტის დაკოპირება ვერ მოხერხდა');
    });
  }

  close() {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  copyLink() {
    const job = this.stateStore.selectedJob();
    const url = window.location.origin + '/home?jobId=' + (job?.id || this.data?.jobId || '');
    navigator.clipboard.writeText(url).then(() => {
      this.alertify.success('ვაკანსიის ბმული დაკოპირდა');
    }).catch(() => {
      this.alertify.error('ბმულის დაკოპირება ვერ მოხერხდა');
    });
  }

  openOriginalSource(link?: string) {
    const targetLink = link || this.stateStore.selectedJob()?.link;
    if (targetLink && targetLink !== '/jobs') {
      window.open(targetLink, '_blank');
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

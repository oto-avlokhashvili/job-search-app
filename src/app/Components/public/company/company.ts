import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../Core/Services/auth-service';
import { JobsService } from '../../../Core/Services/jobs-service';
import { SeoService } from '../../../Core/Services/seo.service';
import { Job } from '../../../Core/Interfaces/jobs';
import { CompanyLogos } from '../../../Core/Utils/company-logos';
import { JobCardItem, JobListCard, toJobCardItem } from '../../shared/job-list-card/job-list-card';

const PAGE_SIZE = 30;
// The public API refuses anonymous requests beyond page 5.
const MAX_PUBLIC_PAGE = 5;

/** All vacancies of one company, matched on its normalized name (companyKey). */
@Component({
  selector: 'app-company',
  standalone: true,
  imports: [RouterModule, JobListCard],
  templateUrl: './company.html',
  styleUrl: './company.scss',
})
export class Company {
  private jobsService = inject(JobsService);
  private seo = inject(SeoService);
  authService = inject(AuthService);
  logos = new CompanyLogos();

  private key = '';
  private page = signal(1);

  name = signal('');
  logo = signal<string | null>(null);
  jobs = signal<JobCardItem[]>([]);
  total = signal(0);
  loading = signal(true);
  loadingMore = signal(false);
  error = signal('');

  canLoadMore = computed(
    () => this.jobs().length < this.total() && (this.authService.isLoggedIn() || this.page() < MAX_PUBLIC_PAGE),
  );

  constructor() {
    // Re-runs when navigating from one company page to another
    inject(ActivatedRoute).paramMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((params) => {
      this.key = params.get('key') ?? '';
      this.load();
    });
  }

  async loadMore() {
    if (this.loadingMore() || !this.canLoadMore()) return;
    this.loadingMore.set(true);
    try {
      const res = await firstValueFrom(this.jobsService.getCompanyJobs(this.key, this.page() + 1, PAGE_SIZE));
      this.page.update((p) => p + 1);
      this.jobs.update((list) => [...list, ...res.jobs.map(toJobCardItem)]);
    } catch {
      // The button stays, so the user can try again
    } finally {
      this.loadingMore.set(false);
    }
  }

  private async load() {
    this.page.set(1);
    this.loading.set(true);
    this.error.set('');
    this.jobs.set([]);
    try {
      const res = await firstValueFrom(this.jobsService.getCompanyJobs(this.key, 1, PAGE_SIZE));
      const jobs = res.jobs || [];
      this.name.set(jobs[0]?.company ?? '');
      this.logo.set(jobs.find((job) => job.companyLogo)?.companyLogo ?? null);
      this.jobs.set(jobs.map(toJobCardItem));
      this.total.set(res.counts?.filteredRecords ?? jobs.length);
      this.updateSeo(jobs);
    } catch {
      this.error.set('ვაკანსიების ჩატვირთვა ვერ მოხერხდა');
    } finally {
      this.loading.set(false);
    }
  }

  private updateSeo(jobs: Job[]) {
    const name = this.name();
    this.seo.update({
      title: name ? `${name} — ვაკანსიები | Job Up` : 'კომპანიის ვაკანსიები | Job Up',
      description: name
        ? `${name}-ის ${this.total()} აქტიური ვაკანსია ერთ სივრცეში: თანამდებობები, ხელფასები და ბოლო ვადები.`
        : 'კომპანიის აქტიური ვაკანსიები Job Up-ზე.',
      path: `/companies/${encodeURIComponent(this.key)}`,
      // A company with no open vacancies is a thin page: keep it out of search results
      noindex: jobs.length === 0,
    });
  }
}

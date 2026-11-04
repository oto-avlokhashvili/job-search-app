import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { FavoritesService } from '../../../Core/Services/favorites.service';
import { SeoService } from '../../../Core/Services/seo.service';
import { Job } from '../../../Core/Interfaces/jobs';
import { CompanyLogos } from '../../../Core/Utils/company-logos';
import { extractSalary } from '../../../Core/Utils/salary-extractor';
import { generateJobSlug } from '../../../Core/Utils/slug-generator';
import { detectJobSource, formatJobDate, JOBUP_LOGO, JOBUP_SOURCE } from '../../../Store/state.store';
import { FavoriteButton } from '../../shared/favorite-button/favorite-button';

interface SavedVacancy {
  id: number;
  vacancy: string;
  company: string;
  location: string;
  source: string;
  salaryRange?: string;
  deadline: string;
  slug: string;
  companyLogo: string | null;
}

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [RouterModule, FavoriteButton],
  templateUrl: './favorites.html',
  styleUrl: './favorites.scss',
})
export class Favorites {
  authService = inject(AuthService);
  favorites = inject(FavoritesService);
  logos = new CompanyLogos();
  jobUpSource = JOBUP_SOURCE;
  jobUpLogo = JOBUP_LOGO;

  private saved = signal<SavedVacancy[]>([]);
  loading = signal(true);
  error = signal('');

  /** Un-hearting a vacancy here removes it from the list right away. */
  visible = computed(() => this.saved().filter((job) => this.favorites.isFavorite(job.id)));

  constructor() {
    inject(SeoService).update({
      title: 'შენახული ვაკანსიები | Job Up',
      description: 'თქვენი შენახული ვაკანსიები Job Up-ზე.',
      path: '/favorites',
      noindex: true,
    });

    // Reload whenever the favorites are (re)synced, e.g. after signing in merges the guest list
    effect(() => {
      this.favorites.version();
      untracked(() => this.load());
    });
  }

  private async load() {
    this.error.set('');
    try {
      const jobs = await this.favorites.loadSaved();
      this.saved.set(jobs.map((job) => this.toSaved(job)));
    } catch {
      this.error.set('შენახული ვაკანსიების ჩატვირთვა ვერ მოხერხდა');
    } finally {
      this.loading.set(false);
    }
  }

  private toSaved(job: Job): SavedVacancy {
    return {
      id: job.id,
      vacancy: job.vacancy,
      company: job.company,
      location: job.location || 'Remote',
      source: detectJobSource(job.source || '', job.link || '', job.company),
      salaryRange: extractSalary(job),
      deadline: job.deadline ? formatJobDate(job.deadline) : '',
      slug: generateJobSlug(job.vacancy, job.company, job.id),
      companyLogo: job.companyLogo ?? null,
    };
  }
}

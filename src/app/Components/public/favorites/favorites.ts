import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { FavoritesService } from '../../../Core/Services/favorites.service';
import { SeoService } from '../../../Core/Services/seo.service';
import { CompanyLogos } from '../../../Core/Utils/company-logos';
import { JobCardItem, JobListCard, toJobCardItem } from '../../shared/job-list-card/job-list-card';

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [RouterModule, JobListCard],
  templateUrl: './favorites.html',
  styleUrl: './favorites.scss',
})
export class Favorites {
  authService = inject(AuthService);
  favorites = inject(FavoritesService);
  logos = new CompanyLogos();

  private saved = signal<JobCardItem[]>([]);
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
      this.saved.set(jobs.map(toJobCardItem));
    } catch {
      this.error.set('შენახული ვაკანსიების ჩატვირთვა ვერ მოხერხდა');
    } finally {
      this.loading.set(false);
    }
  }
}

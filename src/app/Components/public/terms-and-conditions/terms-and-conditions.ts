import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ThemeService } from '../../../Core/Services/theme.service';
import { SeoService } from '../../../Core/Services/seo.service';

@Component({
  selector: 'app-terms-and-conditions',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './terms-and-conditions.html',
  styleUrl: './terms-and-conditions.scss',
})
export class TermsAndConditions implements OnInit {
  themeService = inject(ThemeService);
  private seo = inject(SeoService);
  lastUpdated = '2026 წლის სექტემბერი';
  isLoading = signal(true);

  ngOnInit() {
    this.seo.update({
      title: 'წესები და პირობები | Job Up',
      description: 'Job Up-ის პლატფორმით სარგებლობის წესები და პირობები.',
      path: '/terms',
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    setTimeout(() => {
      this.isLoading.set(false);
    }, 300);
  }
}

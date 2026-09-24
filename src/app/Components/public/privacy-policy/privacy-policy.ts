import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ThemeService } from '../../../Core/Services/theme.service';
import { SeoService } from '../../../Core/Services/seo.service';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './privacy-policy.html',
  styleUrl: './privacy-policy.scss',
})
export class PrivacyPolicy implements OnInit {
  themeService = inject(ThemeService);
  private seo = inject(SeoService);
  lastUpdated = '2026 წლის სექტემბერი';
  isLoading = signal(true);

  ngOnInit() {
    this.seo.update({
      title: 'კონფიდენციალურობის პოლიტიკა | Job Up',
      description: 'Job Up-ის კონფიდენციალურობის პოლიტიკა — როგორ ვაგროვებთ, ვიყენებთ და ვიცავთ თქვენს პერსონალურ მონაცემებს.',
      path: '/privacy',
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    setTimeout(() => {
      this.isLoading.set(false);
    }, 300);
  }
}

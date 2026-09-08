import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ThemeService } from '../../../Core/Services/theme.service';

@Component({
  selector: 'app-terms-and-conditions',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './terms-and-conditions.html',
  styleUrl: './terms-and-conditions.scss',
})
export class TermsAndConditions implements OnInit {
  themeService = inject(ThemeService);
  lastUpdated = '2026 წლის სექტემბერი';
  isLoading = signal(true);

  ngOnInit() {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    setTimeout(() => {
      this.isLoading.set(false);
    }, 300);
  }
}

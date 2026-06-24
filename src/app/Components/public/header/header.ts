import { Component, inject, signal, HostListener } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { ThemeService } from '../../../Core/Services/theme.service';

@Component({
  selector: 'app-header',
  imports: [RouterModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  menuOpen = false;
  authService = inject(AuthService);
  themeService = inject(ThemeService);
  activeSection = signal('features');
  private isScrolling = false;
  private scrollTimeout: any;

  scroll(target: string) {
    const element = document.getElementById(target);
    if (element) {
      this.isScrolling = true;
      this.activeSection.set(target);
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });

      if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
      this.scrollTimeout = setTimeout(() => {
        this.isScrolling = false;
      }, 800);
    }
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    if (this.isScrolling) return;

    const sections = ['features', 'pricing', 'contact'];
    const scrollPosition = window.scrollY || document.documentElement.scrollTop || 0;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;

    // If we've reached the bottom of the page, activate the last section ('contact')
    if (scrollPosition + clientHeight >= scrollHeight - 50) {
      this.activeSection.set('contact');
      return;
    }

    let currentSection = 'features';
    const threshold = 150; // trigger active state when section top is 150px or closer to the viewport top

    for (const sectionId of sections) {
      const el = document.getElementById(sectionId);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= threshold) {
          currentSection = sectionId;
        }
      }
    }

    this.activeSection.set(currentSection);
  }
}

import { Component, inject, signal, HostListener } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
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
  router = inject(Router);
  activeSection = signal('features');
  private isScrolling = false;
  private scrollTimeout: any;

  scroll(target: string) {
    if (this.router.url !== '/home' && this.router.url !== '/') {
      this.router.navigate(['/home']).then(() => {
        setTimeout(() => {
          this.scrollToElement(target);
        }, 150);
      });
    } else {
      this.scrollToElement(target);
    }
  }

  private scrollToElement(target: string) {
    const element = document.getElementById(target);
    if (element) {
      this.isScrolling = true;
      this.activeSection.set(target);
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });

      if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
      this.scrollTimeout = setTimeout(() => {
        this.isScrolling = false;
      }, 1200);
    }
  }

  private rafId: any = null;

  @HostListener('window:scroll', [])
  onWindowScroll() {
    if (this.isScrolling) return;

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }

    this.rafId = requestAnimationFrame(() => {
      this.checkActiveSection();
    });
  }

  private checkActiveSection() {
    const sections = ['features', 'pricing', 'contact'];
    const scrollPosition = window.scrollY || document.documentElement.scrollTop || 0;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;

    // If we've reached the bottom of the page, activate the last section ('contact')
    if (scrollPosition + clientHeight >= scrollHeight - 50) {
      if (this.activeSection() !== 'contact') {
        this.activeSection.set('contact');
      }
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

    if (this.activeSection() !== currentSection) {
      this.activeSection.set(currentSection);
    }
  }
}

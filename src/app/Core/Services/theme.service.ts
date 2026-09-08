import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  isDarkMode = signal<boolean>(true); // dark by default

  init() {
    if (!this.isBrowser) {
      return;
    }
    const saved = localStorage.getItem('app-theme');
    const isDark = saved !== 'light';
    this.isDarkMode.set(isDark);
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.removeProperty('background-color');
    document.body.style.removeProperty('background-color');
  }

  toggle() {
    if (!this.isBrowser) {
      return;
    }
    const next = !this.isDarkMode();
    this.isDarkMode.set(next);
    const theme = next ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.removeProperty('background-color');
    document.body.style.removeProperty('background-color');
    localStorage.setItem('app-theme', theme);
  }
}


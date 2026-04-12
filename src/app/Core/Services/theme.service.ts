import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  isDarkMode = signal<boolean>(true); // dark by default

  init() {
    const saved = localStorage.getItem('app-theme');
    if (saved === 'light') {
      this.isDarkMode.set(false);
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      this.isDarkMode.set(true);
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  toggle() {
    const next = !this.isDarkMode();
    this.isDarkMode.set(next);
    const theme = next ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }
}

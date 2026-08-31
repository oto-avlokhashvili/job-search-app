import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  isDarkMode = signal<boolean>(true); // dark by default

  init() {
    const saved = localStorage.getItem('app-theme');
    const isDark = saved !== 'light';
    this.isDarkMode.set(isDark);
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.removeProperty('background-color');
    document.body.style.removeProperty('background-color');
  }

  toggle() {
    const next = !this.isDarkMode();
    this.isDarkMode.set(next);
    const theme = next ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.removeProperty('background-color');
    document.body.style.removeProperty('background-color');
    localStorage.setItem('app-theme', theme);
  }
}


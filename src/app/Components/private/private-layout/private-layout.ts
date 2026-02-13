import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { firstValueFrom } from 'rxjs';
import { StateStore } from '../../../Store/state.store';
import { User } from '../../../Core/Interfaces/user';

@Component({
  selector: 'app-private-layout',
  imports: [RouterModule, CommonModule],
  templateUrl: './private-layout.html',
  styleUrl: './private-layout.scss',
})
export class PrivateLayout {
  isSidebarOpen = signal<boolean>(false);
  currentYear = signal(new Date().getFullYear());
  isDarkMode = signal<boolean>(false);
  router = inject(Router);
  navItems = signal([
    { icon: '📊', label: 'Dashboard', route: 'dashboard', active: true },
    { icon: '🔍', label: 'Jobs', route: 'jobs' },
    { icon: '💼', label: 'Applications', route: 'applications' },
    { icon: '🔔', label: 'Alerts', route: 'alerts' },
    { icon: '📈', label: 'Analytics', route: 'analytics' },
    { icon: '⚙️', label: 'Profile', route: 'profile' }
  ]);


  authService = inject(AuthService);
  stateStore = inject(StateStore);
  async getProfile() {
    await this.stateStore.loadProfile();
    this.stateStore.loadMatchedJobs(this.stateStore.profile().id);
    this.stateStore.findJobsByQuery(this.stateStore.profile().searchQuery)
  }
  initials = computed(() => {
    const u = this.stateStore.profile();
    if (!u) return '';
    return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
  });



  async ngOnInit() {
    this.getProfile();
    this.getJobs();
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      this.isDarkMode.set(true);
      document.body.classList.add('dark-mode');
    }
  }

  toggleSidebar() {
    this.isSidebarOpen.set(!this.isSidebarOpen());
  }

  closeSidebar() {
    this.isSidebarOpen.set(false);
  }
  getJobs() {
    this.stateStore.loadJobs();
  }
  toggleDarkMode() {
    this.isDarkMode.set(!this.isDarkMode());

    if (this.isDarkMode()) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
    }
  }

  logout() {
    /* this.authService.logOut().then(() => {
      this.router.navigate(['/auth']);
    }); */

  }
}

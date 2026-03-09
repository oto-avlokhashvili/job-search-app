import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
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
export class PrivateLayout implements OnInit{
  isSidebarOpen = signal<boolean>(false);
  currentYear = signal(new Date().getFullYear());
  isDarkMode = signal<boolean>(false);
  router = inject(Router);
  navItems = signal([
    { icon: '📊', label: 'მთავარი', route: 'dashboard', active: true },
    { icon: '🔍', label: 'ნაპოვნი ვაკანსიები', route: 'found-jobs' },
    { icon: '💼', label: 'მიღებული ვაკანსიები', route: 'jobs' },
    { icon: '🔔', label: 'აქტიური ვაკანსიები', route: 'all-jobs' },
    { icon: '📈', label: 'ანალიტიკა', route: 'analytics' },
    { icon: '⚙️', label: 'პროფილი', route: 'profile' }
  ]);


  authService = inject(AuthService);
  stateStore = inject(StateStore);
  async getProfile() {
    await this.stateStore.loadProfile();
    this.stateStore.loadMatchedJobs(this.stateStore.profile().id);
    if(this.stateStore.profile().searchQuery?.length > 0){
      //this.stateStore.findJobsByQuery(this.stateStore.profile().searchQuery)
      this.stateStore.loadJobs(this.stateStore.profile().searchQuery);
    }
  }
  initials = computed(() => {
    const u = this.stateStore.profile();
    if (!u) return '';
    return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
  });



  async ngOnInit() {
    this.getProfile();
    this.stateStore.loadAllJobs([], 1)
    //this.getJobs();
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
  /* getJobs() {
    this.stateStore.loadJobs();
  } */
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

import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';

@Component({
  selector: 'app-private-layout',
  imports: [RouterModule, CommonModule],
  templateUrl: './private-layout.html',
  styleUrl: './private-layout.scss',
})
export class PrivateLayout {
  isSidebarOpen = signal<boolean>(false);
  profile = signal<any>({});
  initials = computed(() => {
  const u = this.profile();
  if (!u) return '';
  return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
});
  currentYear = signal(new Date().getFullYear());
  isDarkMode = signal<boolean>(false);
  navItems= signal([
    { icon: '📊', label: 'Dashboard', route: '/dashboard', active: true },
    { icon: '🔍', label: 'Job Search', route: '/job-search' },
    { icon: '💼', label: 'Applications', route: '/applications' },
    { icon: '🔔', label: 'Alerts', route: '/alerts' },
    { icon: '📈', label: 'Analytics', route: '/analytics' },
    { icon: '⚙️', label: 'Settings', route: '/settings' }
  ]);

  
  authService = inject(AuthService)

  async getProfile(){
    const profile = await this.authService.getUserProfile()
    this.profile.set(profile); 
  }
  ngOnInit() {
    this.getProfile();
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

  toggleDarkMode() {
    this.isDarkMode.set(!this.isDarkMode()) ;
    
    if (this.isDarkMode()) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
    }
  }

  logout() {
    console.log('Logging out...');
    // Implement logout logic here
    // e.g., clear tokens, redirect to login page
    // this.router.navigate(['/login']);
    alert('Logout functionality - Implement your logout logic here');
  }
}

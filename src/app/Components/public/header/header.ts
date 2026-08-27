import { Component, inject, signal, HostListener, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { ThemeService } from '../../../Core/Services/theme.service';
import { StateStore } from '../../../Store/state.store';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionModal } from '../../private/private-layout/subscription-modal/subscription-modal';
import { AlertifyService } from '../../../Core/Services/alertify.service';

@Component({
  selector: 'app-header',
  imports: [RouterModule, CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  menuOpen = false;
  authService = inject(AuthService);
  themeService = inject(ThemeService);
  stateStore = inject(StateStore);
  router = inject(Router);
  dialog = inject(MatDialog);
  private alertify = inject(AlertifyService);
  activeSection = signal('features');
  profileMenuOpen = signal(false);
  privateMenuOpen = signal(false);

  privateNavItems = computed(() => {
    const items = [
      {
        title: 'შეტყობინებები',
        subtitle: 'ახალი და შერჩეული ვაკანსიები',
        icon: '🔔',
        route: '/private/jobs',
      },
      {
        title: 'პროფილი',
        subtitle: 'პირადი მონაცემები & პარამეტრები',
        icon: '⚙️',
        route: '/private/profile',
      },
    ];

    if (this.stateStore.isPro()) {
      items.unshift({
        title: 'AI ძიება',
        subtitle: 'ინტელექტუალური ვაკანსიების ძიება',
        icon: '🤖',
        route: '/private/dashboard',
      });
    }

    return items;
  });

  toggleReceiveMessages(event: any) {
    event.stopPropagation();
    const checked = event.target.checked;
    this.stateStore.updateProfile(this.stateStore.profile()?.id, { receiveMessages: checked });
    this.alertify.success(checked ? 'შეტყობინებების მიღება გააქტიურდა' : 'შეტყობინებების მიღება გამორთულია');
  }

  toggleReceiveMessagesOutside() {
    const current = this.stateStore.profile().receiveMessages ?? false;
    const nextValue = !current;
    this.stateStore.updateProfile(this.stateStore.profile()?.id, { receiveMessages: nextValue });
    this.alertify.success(nextValue ? 'შეტყობინებების მიღება გააქტიურდა' : 'შეტყობინებების მიღება გამორთულია');
  }

  initials = computed(() => {
    const u = this.stateStore.profile();
    if (!u) return '';
    return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
  });

  togglePrivateMenu(event?: Event) {
    if (event) event.stopPropagation();
    this.privateMenuOpen.set(!this.privateMenuOpen());
    if (this.privateMenuOpen()) {
      this.closeProfileMenu();
    }
  }

  openPrivateMenu() {
    this.privateMenuOpen.set(true);
    this.closeProfileMenu();
  }

  closePrivateMenu() {
    this.privateMenuOpen.set(false);
  }

  toggleProfileMenu() {
    this.profileMenuOpen.set(!this.profileMenuOpen());
    if (this.profileMenuOpen()) {
      this.closePrivateMenu();
    }
  }

  closeProfileMenu() {
    this.profileMenuOpen.set(false);
  }

  logout() {
    this.closeProfileMenu();
    this.closePrivateMenu();
    this.authService.logOut().then(() => {
      this.router.navigate(['/home']);
    });
  }

  openUpgradeModal() {
    this.closeProfileMenu();
    this.closePrivateMenu();
    this.dialog.open(SubscriptionModal, {
      width: '560px',
      maxWidth: '95vw',
      panelClass: 'subscription-dialog',
      disableClose: false,
      autoFocus: false,
    });
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.nav-dropdown-container')) {
      this.closePrivateMenu();
    }
    if (!target.closest('.user-profile-menu')) {
      this.closeProfileMenu();
    }
  }
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
    if (
      document.body.classList.contains('modal-open') ||
      document.body.classList.contains('cdk-global-scrollblock') ||
      document.documentElement.classList.contains('cdk-global-scrollblock') ||
      !!document.querySelector('.cdk-overlay-pane')
    ) {
      return;
    }

    const sections = ['features', 'vacancies', 'pricing', 'contact'];
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

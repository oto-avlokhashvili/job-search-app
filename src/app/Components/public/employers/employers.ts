import { Component, computed, DestroyRef, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { SeoService } from '../../../Core/Services/seo.service';
import { SiteModalsService } from '../../../Core/Services/site-modals.service';
import { JOBUP_LOGO, StateStore } from '../../../Store/state.store';

/**
 * The employers' landing page (/employers): the same hero as the job seekers' Home, on the employer
 * side. The phone shows an illustration of the HR panel's AI candidate search, the cards around it
 * the candidate base, CV analysis, hiring stages and interviews. Sign-up / login sits under the lede
 * on desktop and after the phone on phones.
 */
@Component({
  selector: 'app-employers',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './employers.html',
  styleUrl: './employers.scss',
})
export class Employers implements OnInit {
  authService = inject(AuthService);
  private stateStore = inject(StateStore);
  private router = inject(Router);
  private alertify = inject(AlertifyService);
  private seo = inject(SeoService);

  stats = this.stateStore.stats;
  readonly jobUpLogo = JOBUP_LOGO;
  modals = inject(SiteModalsService);
  readonly year = new Date().getFullYear();

  /** HR accounts and admins get the HR panel instead of sign-up */
  isEmployerAccount = computed(() => {
    const role = this.stateStore.profile().role;
    return this.authService.isLoggedIn() && (role === 'HR' || role === 'ADMIN');
  });

  /** The phone is an illustration of the HR search, so its candidates are made up and anonymous */
  readonly sampleCandidates = [
    { initials: 'ნბ', name: 'ნ. ბ.', role: 'მთავარი ბუღალტერი · 6 წელი', match: 94, color: '#6366f1' },
    { initials: 'გმ', name: 'გ. მ.', role: 'ბუღალტერი · 4 წელი', match: 89, color: '#0ea5e9' },
    { initials: 'ლკ', name: 'ლ. კ.', role: 'ბუღალტრის ასისტენტი · 2 წელი', match: 81, color: '#f59e0b' },
  ];

  /** The phone "runs" the AI search: a short load before the candidates show (browser only) */
  candidatesLoading = signal(false);

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.candidatesLoading.set(true);
      const timer = setTimeout(() => this.candidatesLoading.set(false), 900);
      inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    }
  }

  ngOnInit() {
    this.seo.update({
      title: 'Job Up დამსაქმებლებისთვის — AI კანდიდატების ძიება',
      description: 'აღწერე, ვის ეძებ — AI ატვირთული CV-ებიდან შეგირჩევს შესაფერის კანდიდატებს, შერჩევას კი ეტაპებად და გასაუბრებებით ერთ სივრცეში მართავ.',
      path: '/employers',
    });
  }

  /**
   * Sign-up: HR accounts (and admins) go to the HR panel; visitors get employer sign-up with the
   * employer option already ticked. A job seeker's account can't hire, so they're told how instead.
   */
  async openEmployerPath() {
    if (!this.authService.isLoggedIn()) {
      this.authService.openAuthModal('register', '/hr', true);
      return;
    }
    await this.stateStore.loadProfile();
    const role = this.stateStore.profile().role;
    if (role === 'HR' || role === 'ADMIN') {
      this.router.navigate(['/hr']);
    } else {
      this.alertify.warning('დასაქმებისთვის საჭიროა დამსაქმებლის ანგარიში. გამოდით და დარეგისტრირდით როგორც დამსაქმებელი.');
    }
  }
}

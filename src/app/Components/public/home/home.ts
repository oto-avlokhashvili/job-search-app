import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../Core/Services/auth-service';
import { WaitlistService } from '../../../Core/Services/waitlist.service';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { environment } from '../../../../environments/environment';
import { StateStore } from '../../../Store/state.store';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionModal } from '../../private/private-layout/subscription-modal/subscription-modal';
import { WaitlistModal } from '../waitlist-modal/waitlist-modal';
import { PublicCvModal } from '../public-cv-modal/public-cv-modal';
import { JobsService } from '../../../Core/Services/jobs-service';
import { SeoService } from '../../../Core/Services/seo.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterModule, CommonModule, ReactiveFormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  authService = inject(AuthService);
  stateStore = inject(StateStore);
  waitlistService = inject(WaitlistService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private http = inject(HttpClient);
  private alertify = inject(AlertifyService);
  private jobsService = inject(JobsService);
  private seo = inject(SeoService);

  stats = this.stateStore.stats;
  statsLoading = this.stateStore.statsLoading;
  dbTotalRecords = this.stateStore.publicDbTotal;
  jobsGeCount = this.stateStore.publicJobsGeCount;
  hrGeCount = this.stateStore.publicHrGeCount;
  aworkGeCount = this.stateStore.publicAworkGeCount;
  myjobsGeCount = this.stateStore.publicMyjobsGeCount;

  defaultAggregators = [
    { id: 'jobs-ge', name: 'Jobs.ge', active: true },
    { id: 'hr-ge', name: 'HR.ge', active: true },
    { id: 'awork-ge', name: 'Awork.ge', active: true },
    { id: 'myjobs-ge', name: 'MyJobs.ge', active: true },
  ];

  contactEmail = new FormControl<string>('', {
    validators: [Validators.required, Validators.email],
    nonNullable: true
  });
  contactComment = new FormControl<string>('', {
    validators: [Validators.required],
    nonNullable: true
  });

  ngOnInit() {
    this.seo.update({
      title: 'Job Up — AI აგენტი სამსახურის საძებნად',
      description: 'შექმენი საკუთარი AI აგენტი და მოაძებნინე სამსახური მარტივად. ვაკანსიები Jobs.ge, HR.ge, Awork.ge და Myjobs.ge-დან ერთ სივრცეში.',
      path: '/home',
    });
  }

  getAggregatorLogo(id: string): string {
    switch (id) {
      case 'jobs-ge': return '/icons/jobs.png';
      case 'hr-ge': return '/icons/hr.png';
      case 'awork-ge': return '/icons/awork.png';
      case 'myjobs-ge': return '/icons/myjobsge.png';
      default: return '/icons/jobs.png';
    }
  }

  handleHeroClick() {
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/private/profile']);
    } else {
      this.authService.openAuthModal('login');
    }
  }

  joinProWaitlist() {
    if (this.waitlistService.isEnrolled('PRO')) {
      this.alertify.success('თქვენ უკვე დარეგისტრირებული ხართ Pro პაკეტის Waitlist-ში! 🎉');
      return;
    }
    this.dialog.open(WaitlistModal, {
      width: '480px',
      maxWidth: '95vw',
      panelClass: 'waitlist-dialog',
      disableClose: false,
      autoFocus: false,
      data: { plan: 'PRO', source: 'landing_pricing' }
    });
  }

  joinEnterpriseWaitlist() {
    if (this.waitlistService.isEnrolled('ENTERPRISE')) {
      this.alertify.success('თქვენ უკვე დარეგისტრირებული ხართ Enterprise Waitlist-ში! 🎉');
      return;
    }
    this.dialog.open(WaitlistModal, {
      width: '480px',
      maxWidth: '95vw',
      panelClass: 'waitlist-dialog',
      disableClose: false,
      autoFocus: false,
      data: { plan: 'ENTERPRISE', source: 'landing_enterprise_card' }
    });
  }

  handlePlanClick(planKey: string) {
    if (planKey === 'PRO') {
      this.joinProWaitlist();
      return;
    }
    if (planKey === 'PREMIUM' || planKey === 'ENTERPRISE') {
      this.joinEnterpriseWaitlist();
      return;
    }
    if (this.authService.isLoggedIn()) {
      this.openUpgradeModal();
    } else {
      this.authService.openAuthModal('register');
    }
  }

  openUpgradeModal() {
    this.dialog.open(SubscriptionModal, {
      width: '960px',
      maxWidth: '96vw',
      panelClass: 'subscription-dialog',
      disableClose: false,
      autoFocus: false,
    });
  }

  openPublicCvModal() {
    this.dialog.open(PublicCvModal, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'public-cv-dialog',
      autoFocus: false,
    });
  }

  sendContactEmail() {
    if (this.contactEmail.invalid || this.contactComment.invalid) {
      this.alertify.error('გთხოვთ შეავსოთ ყველა ველი სწორად');
      return;
    }

    const payload = {
      email: this.contactEmail.value,
      comment: this.contactComment.value
    };

    this.http.post(`${environment.apiUrl}/email/contact`, payload).subscribe({
      next: () => {
        this.alertify.success('შეტყობინება წარმატებით გაიგზავნა');
        this.contactEmail.reset();
        this.contactComment.reset();
      },
      error: (err) => {
        console.error('Error sending contact email:', err);
        this.alertify.error('შეტყობინების გაგზავნისას დაფიქსირდა შეცდომა');
      }
    });
  }

  scroll(target: string) {
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

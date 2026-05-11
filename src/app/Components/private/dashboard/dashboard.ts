import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { JobsService } from '../../../Core/Services/jobs-service';
import { AuthService } from '../../../Core/Services/auth-service';
import { firstValueFrom } from 'rxjs';
import { StateStore } from '../../../Store/state.store';
import { RouterModule } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { QrModal } from './qr-modal/qr-modal';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Ai } from '../../../Core/Services/ai';
import { Cv } from '../../../Core/Services/cv';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { environment } from '../../../../environments/environment';

interface StatCard {
  icon: string;
  value: number;
  label: string;
  colorClass: string;
}

interface Job {
  title: string;
  company: string;
  location: string;
  type: string;
  postedTime: string;
  salary: string;
  badge?: {
    text: string;
    class: string;
  };
}

interface Activity {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  time: string;
}
@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})

export class Dashboard implements OnInit {
  jobsService = inject(JobsService);
  authService = inject(AuthService);
  aiService = inject(Ai);
  profile = signal<any>({});
  allJobs = signal<any>([]);
  userMatchedJobs = signal<any>([]);
  cvService = inject(Cv);
  alertify = inject(AlertifyService);
  userCv = signal<any>(null);
  loadingCv = signal<boolean>(false);
  stateStore = inject(StateStore);
  profileId = computed(() => this.stateStore.profile()?.id);
  recentlyViewed = signal<string>('')
  cvSummary = computed(() => this.stateStore.userCv()?.summary);
  stats = computed(() => {
    //const jobs = this.stateStore.jobsCount() ?? 0;
    const matched = this.stateStore.matchedJobsCount() ?? 0;
    const sent = this.stateStore.sentJobsCount() ?? 0;
    const searchQueryLength = this.stateStore.searchQuery()?.length ?? 0;
    return [
      {
        icon: '⚡',
        value: matched,
        label: `AI-ვაკანსიები`,
        colorClass: 'blue',
      },
      { icon: '🕒', value: sent, label: 'ვაკასნიების ისტორია', colorClass: 'orange', redirectTo: '/private/jobs' },
      { icon: '📧', value: searchQueryLength, label: 'საძიებელი პარამეტრები', colorClass: 'green' },
      { icon: '💼', value: 0, label: 'ყველა ვაკანსია', colorClass: 'purple', redirectTo: '/private/all-jobs' },

    ];
  });


  jobs = signal<any>([
    {
      vacancy: '--------',
      location: '--------',
      company: '--------',
      link: '--------',
      deadline: "--------",
      publishDate: "--------",
      salaryRange: "--------",
      match: "--------",
    },
    {
      vacancy: '--------',
      location: '--------',
      company: '--------',
      link: '--------',
      deadline: "--------",
      publishDate: "--------",
      salaryRange: "--------",
      match: "--------",
    },
    {
      vacancy: '--------',
      location: '--------',
      company: '--------',
      link: '--------',
      deadline: "--------",
      publishDate: "--------",
      salaryRange: "--------",
      match: "--------",
    },
  ]);

  activities = computed<Activity[]>(() => [
    {
      icon: '✓',
      iconBg: '#c6f6d5',
      iconColor: '#22543d',
      title: 'ბოლოს ნანახი ვაკანსია',
      description: this.recentlyViewed(),
      time: ''
    },
    {
      icon: '⚡',
      iconBg: '#bee3f8',
      iconColor: '#2c5282',
      title: 'ხელმისაწვდომი ვაკანსიების ჯამი',
      description: 0 + ' ვაკანსია',
      time: ''
    },
    {
      icon: '/icons/telegram.png',
      iconBg: '#fed7d7',
      iconColor: '#742a2a',
      title: 'ტელეგრამი',
      description: this.stateStore.profile()?.telegramChatId
        ? 'დაკავშირებული'
        : 'არ არის დაკავშირებული',
      time: ''
    },
    {
      icon: '/icons/gmail.png',
      iconBg: '#f1f0eeff',
      iconColor: '#7c2d12',
      title: 'ელ-ფოსტა',
      description: 'არ არის დაკავშირებული',
      time: ''
    }
  ]);

  constructor(private dialog: MatDialog) { }
  ngOnInit() {
    this.recentlyViewed.set(localStorage.getItem('recently_viewed') || 'არ არის ხელმისაწვდომი');

  }

  scrollToTable() {
    document.getElementById('ai-jobs-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  loadMatchedJobs(page: number) {
    this.stateStore.loadAIMatchedJobs(page, 6);
  }

  onPageChange(page: number) {
    if (page >= 1 && page <= this.stateStore.matchedJobsDashboard().lastPage) {
      this.loadMatchedJobs(page);
      // Scroll to top of the jobs section if needed
      document.querySelector('.vacancy-cards-container')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.uploadCv(file);
    }
  }

  uploadCv(file: File) {
    this.stateStore.uploadCv(file);
  }

  deleteCv() {
    this.stateStore.deleteCv();

  }

  applyJob(job: string): void {
    window.open(`${job}`, '_blank');
  }
  telegramLink = signal<string>("");
  async generateTelegramToken() {
    const res = await this.authService.generateTelegramToken();
    this.telegramLink.set(`${environment.telegramUrl}?start=${res}`);

    if (res) {
      // Check if the user is on a mobile device
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (isMobile) {
        // Redirect on mobile
        window.location.href = this.telegramLink();
      } else {
        // Show dialog on desktop
        this.openDialog(this.telegramLink());
      }
    }
  }

  openDialog(link: string) {
    const dialogRef = this.dialog.open(QrModal, {
      width: '400px',
      disableClose: true,
      autoFocus: false,
      data: { telegramLink: link }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.stateStore.loadProfile();
      }
    });
  }

  saveViewedVacancy(title: string) {
    localStorage.setItem("recently_viewed", title);
    this.recentlyViewed.set(title);
  }
  addKeyword(input: HTMLInputElement) {
    const value = input.value?.trim();
    if (!value) return;

    const currentProfile = this.stateStore.searchQuery();
    if (!currentProfile) return;

    const existingQueries = currentProfile ?? [];
    if (!existingQueries.includes(value)) {
      const updatedQueries = [...existingQueries, value];
      this.stateStore.updateSearchQueries(updatedQueries);
    }
    input.value = '';
  }

  removeKeyword(index: number) {
    const currentProfile = this.stateStore.searchQuery();
    if (!currentProfile) return;

    const existingQueries = currentProfile ?? [];
    const updatedQueries = existingQueries.filter((_: any, i: number) => i !== index);

    this.stateStore.updateSearchQueries(updatedQueries);
  }


}

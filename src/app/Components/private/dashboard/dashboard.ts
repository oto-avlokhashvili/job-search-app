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
  stateStore = inject(StateStore);
  profileId = computed(() => this.stateStore.profile()?.id);
  recentlyViewed = signal<string>('')
  stats = computed(() => {
    const jobs = this.stateStore.jobsCount() ?? 0;
    const searched = this.stateStore.searchedJobsCount() ?? 0;

    const percentage = this.stateStore.matchedPercentage();

    return [
      { icon: '⚡', value: jobs, label: 'აქტიური ვაკასნია', colorClass: 'blue', redirectTo: '/private/all-jobs' },
      {
        icon: '🎯',
        value: searched,
        label: `ნაპოვვნი (${(this.stateStore.profile()?.searchQuery ?? [])
          .slice(0, 2)
          .join(', ')}${(this.stateStore.profile()?.searchQuery?.length ?? 0) > 2 ? ' და ა.შ.' : ''
          }) -ის ვაკანსია`,
        colorClass: 'purple',
        redirectTo: '/private/found-jobs'
      },
      { icon: '✓', value: this.stateStore.matchedJobsCount() ?? 0, label: 'მიღებული ვაკასნიების ისტორია', colorClass: 'green', redirectTo: '/private/jobs' },
      { icon: '📧', value: percentage + "%", label: 'შენთვის შესაბამისი ვაკანსიები', colorClass: 'orange', redirectTo: '/private/analytics' },
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
      salaryRange:"--------",
      match:"--------",
    },
    {
      vacancy: '--------',
      location: '--------',
      company: '--------',
      link: '--------',
      deadline: "--------",
      publishDate: "--------",
      salaryRange:"--------",
      match:"--------",
    },
    {
      vacancy: '--------',
      location: '--------',
      company: '--------',
      link: '--------',
      deadline: "--------",
      publishDate: "--------",
      salaryRange:"--------",
      match:"--------",
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
      description: this.stateStore.jobsCount().toString() + ' ვაკანსია',
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

  applyJob(job: string): void {
    window.open(`${job}`, '_blank');
  }

  saveJob(job: Job): void {
    console.log('Saving job:', job.title);
    // Implement save logic
  }
  telegramLink = signal<string>("");
  async generateTelegramToken() {
    const res = await this.authService.generateTelegramToken();
    this.telegramLink.set("https://t.me/job_notifcation_bot?start=" + res);

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

    const currentProfile = this.stateStore.profile();
    if (!currentProfile) return;

    const existingQueries = currentProfile.searchQuery ?? [];
    if (!existingQueries.includes(value)) {
      const updatedQueries = [...existingQueries, value];
      this.stateStore.updateProfile(currentProfile.id, {
        searchQuery: updatedQueries
      });
      this.stateStore.loadJobs(updatedQueries);
    }
    input.value = '';
  }

  removeKeyword(index: number) {
    const currentProfile = this.stateStore.profile();
    if (!currentProfile) return;

    const existingQueries = currentProfile.searchQuery ?? [];
    const updatedQueries = existingQueries.filter((_: any, i: number) => i !== index);

    this.stateStore.updateProfile(currentProfile.id, {
      searchQuery: updatedQueries
    });
    this.stateStore.loadJobs(updatedQueries);
  }
  getJobBadgeByProgress(publishDate: string, deadline: string) {
    const today = new Date();
    const start = new Date(publishDate.split('/').reverse().join('-')); // DD/MM/YYYY → YYYY-MM-DD
    const end = new Date(deadline.split('/').reverse().join('-'));

    // Check if expired first
    if (today > end) {
      return { class: 'badge-expired', text: 'ვადა ამოიწურა' };
    }

    const totalMs = end.getTime() - start.getTime();
    const elapsedMs = today.getTime() - start.getTime();

    const progress = elapsedMs / totalMs;

    if (progress <= 1 / 3) {
      return { class: 'badge-new', text: 'ცხელ-ცხელი' };
    } else if (progress <= 2 / 3) {
      return { class: 'badge-average', text: 'ახალი' };
    } else {
      return { class: 'badge-urgent', text: 'ვადა მალე ამოიწურება' };
    }
  }
  salary = signal<any>({
    minSalary: "",
    maxSalary: "",
    index: -1
  });
  analyzeJob(job: any, index: number) {
    this.jobsService.analyzeJob(job).subscribe({
      next: (res) => {
        this.salary.set({ ...res, index });
      },
      error: (err) => {
        console.log(err);
      }
    });
  }
  analyzeCvAndJobs() {
    this.stateStore.analyzeCvAndJobs();
  }
}

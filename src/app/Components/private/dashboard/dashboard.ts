import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { JobsService } from '../../../Core/Services/jobs-service';
import { AuthService } from '../../../Core/Services/auth-service';
import { firstValueFrom } from 'rxjs';
import { StateStore } from '../../../Store/state.store';
import { RouterModule } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { QrModal } from './qr-modal/qr-modal';

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
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})

export class Dashboard implements OnInit{
  jobsService = inject(JobsService);
  authService = inject(AuthService);
  profile = signal<any>({});
  allJobs = signal<any>([]);
  userMatchedJobs = signal<any>([]);
  stateStore = inject(StateStore);
  profileId = computed(() => this.stateStore.profile()?.id);
  recentlyViewed = signal<string>('')
  stats = computed(() => {
    const jobs = this.stateStore.jobsCount() ?? 0;
    const searched = this.stateStore.searchedJobsCount() ?? 0;

    const percentage =
      jobs > 0 ? ((searched / jobs) * 100).toFixed(2) : '0';

    return [
      { icon: '⚡', value: jobs, label: 'აქტიური ვაკასნია', colorClass: 'blue' },
      { icon: '🎯', value: searched, label: `ნაპოვვნი ${this.stateStore.profile()?.searchQuery ?? ''}-ის ვაკანსია`, colorClass: 'purple' },
      { icon: '✓', value: this.stateStore.matchedJobsCount() ?? 0, label: 'მიღებული ვაკასნიები', colorClass: 'green' },
      { icon: '📧', value: percentage+"%", label: 'შენთვის შესაბამისი ვაკანსიები', colorClass: 'orange' },
    ];
  });


  jobs = signal([
    {
      vacancy: '--------',
      company: '--------',
      link: '--------',
      deadline: "--------",
      publishDate: "--------",
    },
    {
      vacancy: '--------',
      company: '--------',
      link: '--------',
      deadline: "--------",
      publishDate: "--------",
    },
    {
      vacancy: '--------',
      company: '--------',
      link: '--------',
      deadline: "--------",
      publishDate: "--------",
    },
  ]);

  activities = signal<Activity[]>(
    [
      {
        icon: '✓',
        iconBg: '#c6f6d5',
        iconColor: '#22543d',
        title: ' ბოლოს ნანახი ვაკანსა',
        description: 'არ არის ხელმისაწვდომი',
        time: '2 hours ago'
      },
      {
        icon: '⚡',
        iconBg: '#bee3f8',
        iconColor: '#2c5282',
        title: 'ნანახი ვაკანსიების ჯამი',
        description: 'არ არის ხელმისაწვდომი',
        time: '4 hours ago'
      },
      {
        icon: '📅',
        iconBg: '#e9d8fd',
        iconColor: '#553c9a',
        title: 'ჩანიშნული გასაუბრებები',
        description: 'არ არის ხელმისაწვდომი',
        time: '1 day ago'
      },
      {
        icon: '/icons/telegram.png',
        iconBg: '#fed7d7',
        iconColor: '#742a2a',
        title: 'ტელეგრამი',
        description: 'არ არის დაკავშირებული',
        time: '2 days ago'
      },
      {
        icon: '/icons/gmail.png',
        iconBg: '#feebc8',
        iconColor: '#7c2d12',
        title: 'ელ-ფოსტა',
        description: 'არ არის დაკავშირებული',
        time: '6 hours ago'
      },
    ]
  ) 

  constructor(private dialog: MatDialog) { }
  ngOnInit() {
    const recent = localStorage.getItem('recently_viewed');
    if (recent) {
      this.activities.update(list =>
        list.map((item, index) =>
          index === 0
            ? { ...item, description: recent }
            : item
        )
      );
    }
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

  saveViewedVacancy(title:string){
    localStorage.setItem("recently_viewed",title);
    const recent = localStorage.getItem('recently_viewed');
    if (recent) {
      this.activities.update(list =>
        list.map((item, index) =>
          index === 0
            ? { ...item, description: recent }
            : item
        )
      );
    }
  }
}

import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { JobsService } from '../../../Core/Services/jobs-service';
import { AuthService } from '../../../Core/Services/auth-service';
import { firstValueFrom } from 'rxjs';
import { StateStore } from '../../../Store/state.store';
import { RouterModule } from '@angular/router';
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

export class Dashboard {
  jobsService = inject(JobsService);
  authService = inject(AuthService);
  profile = signal<any>({});
  allJobs = signal<any>([]);
  userMatchedJobs = signal<any>([]);
  stateStore = inject(StateStore);
  profileId = computed(() => this.stateStore.profile()?.id);
  stats = computed(() => [
    { icon: '⚡', value: this.stateStore.jobsCount(), label: 'აქტიური ვაკასნია', colorClass: 'blue' },
    { icon: '✓', value: 0, label: 'გაგზავნილი აპლიკაციები', colorClass: 'green' },
    { icon: '📧', value: 0, label: 'მიღებული შეტყობინებები', colorClass: 'orange' },
    { icon: '🎯', value: this.stateStore.matchedJobsCount(), label: 'მიღებული ვაკასნიები', colorClass: 'purple' }
  ]);

    jobs = signal([
    {
      vacancy: '--------',
      company: '--------',
      link:'--------',
      deadline:"--------",
      publishDate:"--------",
    },
    {
      vacancy: '--------',
      company: '--------',
      link:'--------',
      deadline:"--------",
      publishDate:"--------",
    },
    {
      vacancy: '--------',
      company: '--------',
      link:'--------',
      deadline:"--------",
      publishDate:"--------",
    },
  ]);

  activities: Activity[] = [
    {
      icon: '✓',
      iconBg: '#c6f6d5',
      iconColor: '#22543d',
      title: 'Application Submitted',
      description: 'Software Engineer at Google',
      time: '2 hours ago'
    },
    {
      icon: '📧',
      iconBg: '#bee3f8',
      iconColor: '#2c5282',
      title: 'New Message',
      description: 'Recruiter from Microsoft',
      time: '4 hours ago'
    },
    {
      icon: '⚡',
      iconBg: '#feebc8',
      iconColor: '#7c2d12',
      title: 'New Job Alert',
      description: '5 matching jobs found',
      time: '6 hours ago'
    },
    {
      icon: '📅',
      iconBg: '#e9d8fd',
      iconColor: '#553c9a',
      title: 'Interview Scheduled',
      description: 'Data Analyst at Amazon',
      time: '1 day ago'
    },
    {
      icon: '📄',
      iconBg: '#fed7d7',
      iconColor: '#742a2a',
      title: 'Profile Viewed',
      description: 'Your profile was viewed 12 times',
      time: '2 days ago'
    }
  ];
  
  constructor() { }

  applyJob(job: string): void {
  window.open(`${job}`, '_blank');
}

  saveJob(job: Job): void {
    console.log('Saving job:', job.title);
    // Implement save logic
  }
}

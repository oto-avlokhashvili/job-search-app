import { Component, inject, OnInit, signal } from '@angular/core';
import { StateStore } from '../../../Store/state.store';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sent-jobs',
  imports: [CommonModule],
  templateUrl: './sent-jobs.html',
  styleUrl: './sent-jobs.scss',
})
export class SentJobs {
  stateStore = inject(StateStore);
  page = signal<number>(this.stateStore.matchedJobsPage() || 1);
  limit = signal<number>(10);
  

  activities: any[] = [
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

  nextPage() {
    this.page.set(this.page() + 1);
    this.stateStore.loadMatchedJobs(this.stateStore.profile()?.id, this.page());
  }
  previousPage() {
    this.page.set(this.page() - 1);
    this.stateStore.loadMatchedJobs(this.stateStore.profile()?.id, this.page());
  }
  applyJob(job: string): void {
    window.open(`${job}`, '_blank');
  }
}

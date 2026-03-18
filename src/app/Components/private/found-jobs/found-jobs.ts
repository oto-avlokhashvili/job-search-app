import { Component, inject, signal } from '@angular/core';
import { StateStore } from '../../../Store/state.store';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-found-jobs',
  imports: [CommonModule],
  templateUrl: './found-jobs.html',
  styleUrl: './found-jobs.scss',
})
export class FoundJobs {
[x: string]: any;
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
    this.stateStore.loadJobs( this.stateStore.profile().searchQuery,this.page());
  }
  previousPage() {
    this.page.set(this.page() - 1);
    this.stateStore.loadJobs( this.stateStore.profile().searchQuery,this.page());
  }
  totalPages(): number {
  return Math.ceil(this.stateStore.searchedJobsCount() / 10);
}
  applyJob(job: string): void {
    window.open(`${job}`, '_blank');
  }
  saveViewedVacancy(title:string){
    localStorage.setItem("recently_viewed",title);
  }

getJobBadgeByProgress(publishDate: string, deadline: string) {
  const today = new Date();
  const start = new Date(publishDate.split('/').reverse().join('-')); // DD/MM/YYYY → YYYY-MM-DD
  const end = new Date(deadline.split('/').reverse().join('-'));

  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = today.getTime() - start.getTime();
  
  const progress = elapsedMs / totalMs;

  if (progress <= 1/3) {
    return { class: 'badge-new', text: 'ცხელ-ცხელი' };
  } else if (progress <= 2/3) {
    return { class: 'badge-average', text: 'ახალი' };
  } else {
    return { class: 'badge-urgent', text: 'ვადა მალე ამოიწურება' };
  }
}

}

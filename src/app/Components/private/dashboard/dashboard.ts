import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { JobsService } from '../../../Core/Services/jobs-service';
import { AuthService } from '../../../Core/Services/auth-service';
import { firstValueFrom } from 'rxjs';
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
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})

export class Dashboard {
  jobsService = inject(JobsService);
  authService = inject(AuthService);
  profile = signal<any>({});
  allJobs = signal<any>([]);
  userMatchedJobs = signal<any>([]);
  stats = computed(() => [
    { icon: '⚡', value: this.allJobs().count, label: 'Active Jobs', colorClass: 'blue' },
    { icon: '✓', value: 0, label: 'Applications Sent', colorClass: 'green' },
    { icon: '📧', value: 0, label: 'Responses', colorClass: 'orange' },
    { icon: '🎯', value: this.userMatchedJobs().count, label: 'Matched Jobs', colorClass: 'purple' }
  ]);

  jobs: Job[] = [
    {
      title: 'Senior Frontend Developer',
      company: 'Tech Corp Inc.',
      location: 'San Francisco, CA',
      type: 'Full-time',
      postedTime: '2 hours ago',
      salary: '$120k - $160k/year',
      badge: { text: 'New', class: 'badge-new' }
    },
    {
      title: 'Product Manager',
      company: 'Innovation Labs',
      location: 'Remote',
      type: 'Full-time',
      postedTime: '5 hours ago',
      salary: '$130k - $180k/year',
      badge: { text: 'Urgent', class: 'badge-urgent' }
    },
    {
      title: 'UX Designer',
      company: 'Creative Studio',
      location: 'New York, NY',
      type: 'Full-time',
      postedTime: '1 day ago',
      salary: '$90k - $120k/year',
      badge: { text: 'New', class: 'badge-new' }
    }
  ];

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
  async getJobs(){
    this.allJobs.set(await this.jobsService.getJobs());
  }
  async getUserMatchedJobs(id:number){
    this.userMatchedJobs.set(await this.jobsService.getUserMatchedJobs(id));
  }
  async getProfile(){
    const profile = await firstValueFrom(this.authService.getUserProfile());
    this.profile.set(profile); 
  }
  
  async ngOnInit() {
    await this.getProfile();
    this.getJobs();
    this.getUserMatchedJobs(this.profile().id);
  }

  applyJob(job: Job): void {
    console.log('Applying to:', job.title);
    // Implement application logic
  }

  saveJob(job: Job): void {
    console.log('Saving job:', job.title);
    // Implement save logic
  }
}

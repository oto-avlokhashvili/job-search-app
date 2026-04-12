import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpContext } from '@angular/common/http';
import { JobsService } from '../../../Core/Services/jobs-service';
import { Job } from '../../../Core/Interfaces/jobs';
import { skipLoading } from '../../../Core/loading/skip-loading.component';

@Component({
  selector: 'app-home',
  imports: [RouterModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  jobsService = inject(JobsService);
  ngOnInit() {
    this.getJobs();
  }
  getJobs(){
    this.jobsService.getJobs().subscribe({
      next: (res) => {
        this.jobs.set(res.jobs.slice(0, 5));
      },
      error: (err) => {
        console.log(err);
      },
      
    })  
  }
    
  jobs = signal<Job[]>([
      {
        id: 1,
        vacancy: 'Senior Product Designer',
        company: 'PixelFlow Studio',
        location: 'Remote',
        salaryRange: '$140k - $180k',
        link: '#',
        publishDate: '2024-04-01',
        deadline: '2024-05-01'
      },
      {
        id: 2,
        vacancy: 'Engineering Lead',
        company: 'CloudScale AI',
        location: 'San Francisco, CA',
        salaryRange: '$190k - $240k',
        link: '#',
        publishDate: '2024-04-02',
        deadline: '2024-05-02'
      },
      {
        id: 3,
        vacancy: 'Senior UX Researcher',
        company: 'Horizon Creative',
        location: 'Remote',
        salaryRange: '$90/hr - $120/hr',
        link: '#',
        publishDate: '2024-04-03',
        deadline: '2024-05-03'
      },
      {
        id: 4,
        vacancy: 'Growth Marketing Manager',
        company: 'Vault Finance',
        location: 'New York, NY',
        salaryRange: '$120k - $160k',
        link: '#',
        publishDate: '2024-04-04',
        deadline: '2024-05-04'
      },
      {
        id: 5,
        vacancy: 'Environmental Consultant',
        company: 'EcoSystems Inc',
        location: 'Hybrid',
        salaryRange: '$105k - $135k',
        link: '#',
        publishDate: '2024-04-05',
        deadline: '2024-05-05'
      }
    ]);
  isLoading = signal(false);

  scroll(target: string) {
    document.querySelector(`#${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  applyJob(job: string): void {
    window.open(`${job}`, '_blank');
  }
}

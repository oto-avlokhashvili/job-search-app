import { Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpContext } from '@angular/common/http';
import { JobsService } from '../../../Core/Services/jobs-service';
import { Job } from '../../../Core/Interfaces/jobs';
import { skipLoading } from '../../../Core/loading/skip-loading.component';

import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterModule, CommonModule, ReactiveFormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {

  search = new FormControl<string>('')
  searchQuery = signal<string>('');
  count = signal<number>(0)
  jobsService = inject(JobsService);
  ngOnInit() {
    this.jobsService.getJobs("").subscribe({
    next: (res) => {
      this.jobs.set(res.jobs.slice(0, 5));
      this.count.set(res.counts?.totalRecords);
    },
    error: (err) => {
      console.log(err);
    },
  });

    this.search.valueChanges.subscribe((value) => {
      if(value){
        this.searchQuery.set(value);
      }
    });
  }
@ViewChild('browseSection') browseSectionRef!: ElementRef;

getJobs(query?: string) {
  this.jobsService.getJobs(query).subscribe({
    next: (res) => {
      this.jobs.set(res.jobs.slice(0, 5));
      setTimeout(() => {
        this.browseSectionRef.nativeElement.scrollIntoView({ behavior: 'smooth' });
      }, 0);
    },
    error: (err) => {
      console.log(err);
    },
  });
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



  clearSearch() {
    this.searchQuery.set('');
    this.search.reset();
  }

  onSearch() {
    console.log('Searching for:', this.searchQuery());
    // Implement search logic here
  }

  scroll(target: string) {
    document.querySelector(`#${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  applyJob(job: string): void {
    window.open(`${job}`, '_blank');
  }
  
}

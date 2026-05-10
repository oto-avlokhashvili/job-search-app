import { Component, ElementRef, inject, OnInit, signal, ViewChild, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
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
export class Home implements OnInit, AfterViewInit, OnDestroy {

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
  @ViewChild('particleCanvas') particleCanvasRef!: ElementRef<HTMLCanvasElement>;

  private animationFrameId: number | null = null;
  private ngZone = inject(NgZone);

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => this.initParticles());
  }

  ngOnDestroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private initParticles() {
    const canvas = this.particleCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 55;
    interface Particle {
      x: number; y: number;
      r: number; speed: number;
      opacity: number; drift: number;
      color: string;
    }

    const colors = ['rgba(11,96,150,', 'rgba(151,174,213,', 'rgba(22,47,80,'];

    const make = (): Particle => ({
      x: Math.random() * canvas.width,
      y: canvas.height + Math.random() * 60,
      r: Math.random() * 2.5 + 0.8,
      speed: Math.random() * 0.5 + 0.2,
      opacity: Math.random() * 0.45 + 0.1,
      drift: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    });

    const particles: Particle[] = Array.from({ length: COUNT }, make);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.opacity})`;
        ctx.fill();

        p.y -= p.speed;
        p.x += p.drift;
        p.opacity -= 0.0008;

        if (p.y < -10 || p.opacity <= 0) {
          Object.assign(p, make());
        }
      }
      this.animationFrameId = requestAnimationFrame(draw);
    };

    draw();
  }

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

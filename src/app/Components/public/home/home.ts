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
  hasSearched = signal<boolean>(false);
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
  @ViewChild('searchContainer') searchContainerRef!: ElementRef;

  private animationFrameId: number | null = null;
  private ngZone = inject(NgZone);
  searchState: 'idle' | 'searching' | 'burst' = 'idle';

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

    const COUNT = 80;
    interface Particle {
      x: number; y: number;
      r: number; speed: number;
      opacity: number; drift: number;
      color: string;
      vx?: number;
      vy?: number;
    }

    const colors = ['rgba(11,96,150,', 'rgba(151,174,213,', 'rgba(22,47,80,'];

    const make = (): Particle => ({
      x: Math.random() * canvas.width,
      y: canvas.height + Math.random() * 60,
      r: Math.random() * 2.5 + 2.0,
      speed: Math.random() * 1.1 + 0.4,
      opacity: Math.random() * 0.5 + 0.25,
      drift: (Math.random() - 0.5) * 1.0,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: 0,
      vy: 0
    });

    const particles: Particle[] = Array.from({ length: COUNT }, make);

    const container = this.searchContainerRef?.nativeElement;
    const updateContainerBounds = () => {
      if (!container) return null;
      const canvasRect = canvas.getBoundingClientRect();
      const rect = container.getBoundingClientRect();
      return {
        left: rect.left - canvasRect.left,
        right: rect.right - canvasRect.left,
        top: rect.top - canvasRect.top,
        bottom: rect.bottom - canvasRect.top,
        width: rect.width,
        height: rect.height,
        centerX: (rect.left + rect.right) / 2 - canvasRect.left,
        centerY: (rect.top + rect.bottom) / 2 - canvasRect.top,
      };
    };

    let bounds = updateContainerBounds();
    window.addEventListener('resize', () => {
      resize();
      bounds = updateContainerBounds();
    });

    let lastState: 'idle' | 'searching' | 'burst' = 'idle';

    const draw = () => {
      if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
        resize();
        bounds = updateContainerBounds();
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const state = this.searchState;

      if (state === 'searching' && lastState !== 'searching') {
        bounds = updateContainerBounds();
      }

      if (state === 'burst' && lastState !== 'burst') {
        bounds = updateContainerBounds();
        if (bounds) {
          for (const p of particles) {
            const angle = Math.atan2(p.y - bounds.centerY, p.x - bounds.centerX);
            const force = Math.random() * 6 + 4;
            p.vx = Math.cos(angle) * force;
            p.vy = Math.sin(angle) * force + 2;
          }
        }
      }

      lastState = state;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.opacity})`;
        ctx.fill();

        if (state === 'searching' && bounds) {
          const targetX = bounds.left + (i / COUNT) * bounds.width;
          const time = Date.now() * 0.006;
          const wave = Math.sin((targetX - bounds.left) * 0.03 - time) * 10;
          const targetY = bounds.bottom + 12 + wave;

          p.x += (targetX - p.x) * 0.08;
          p.y += (targetY - p.y) * 0.08;
          p.opacity += (0.75 - p.opacity) * 0.1;
        } else if (state === 'burst') {
          p.x += p.vx || 0;
          p.y += p.vy || 0;
          p.opacity -= 0.025;

          if (p.opacity <= 0) {
            Object.assign(p, make());
          }
        } else {
          p.y -= p.speed;
          p.x += p.drift;
          p.opacity -= 0.001;

          if (p.y < -10 || p.opacity <= 0) {
            Object.assign(p, make());
          }
        }
      }
      this.animationFrameId = requestAnimationFrame(draw);
    };

    draw();
  }

  getJobs(query?: string) {
    this.searchState = 'searching';
    const startTime = Date.now();

    this.jobsService.getJobs(query).subscribe({
      next: (res) => {
        const elapsedTime = Date.now() - startTime;
        const minDuration = 1000;
        const delay = Math.max(0, minDuration - elapsedTime);

        setTimeout(() => {
          this.jobs.set(res.jobs.slice(0, 5));
          this.hasSearched.set(true);
          this.searchState = 'burst';

          setTimeout(() => {
            if (this.searchState === 'burst') {
              this.searchState = 'idle';
            }
          }, 600);
        }, delay);
      },
      error: (err) => {
        console.log(err);
        this.searchState = 'idle';
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
    this.hasSearched.set(false);
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

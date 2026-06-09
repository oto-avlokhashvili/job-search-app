import {
  Component,
  inject,
  ViewChild,
  ElementRef,
  computed,
  OnInit,
  signal,
  effect,
  untracked,
  AfterViewInit,
  OnDestroy,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateStore } from '../../../Store/state.store';
import { ChatStore } from '../../../Store/chat.store';
import { ActivatedRoute, Router } from '@angular/router';
import { Ai } from '../../../Core/Services/ai';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { QrModal } from '../dashboard/qr-modal/qr-modal';
import { EmailVerifyModal } from './email-verify-modal/email-verify-modal';
import { SubscriptionModal } from '../private-layout/subscription-modal/subscription-modal';
import { AuthService } from '../../../Core/Services/auth-service';
import { environment } from '../../../../environments/environment';
import { JobsService } from '../../../Core/Services/jobs-service';

export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  file: File;
}

export interface JobMatch {
  id: number;
  vacancy: string;
  location: string;
  company: string;
  link: string;
  publishDate: string;
  deadline: string;
  salaryRange?: string;
  match: number;
  queryMatch: boolean;
  matchReason: string;
  matchGaps?: string[];
}

export interface AiStructuredResponse {
  candidateProfile?: any;
  summary?: string;
  strengths?: string[];
  skillGaps?: string[];
  topJobs?: JobMatch[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  data?: AiStructuredResponse;
  timestamp: Date;
  attachments?: AttachedFile[];
  isLoading?: boolean;
  isError?: boolean;
}

@Component({
  selector: 'app-chat',
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
  host: {
    '[class.has-results]': 'showJobs()',
  },
})
export class Chat implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('fileInput') private fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('particleCanvas') particleCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('searchContainer') searchContainerRef!: ElementRef;

  stateStore = inject(StateStore);
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
      r: Math.random() * 2.5 + 1.0,
      speed: Math.random() * 1.1 + 0.4,
      opacity: Math.random() * 0.5 + 0.15,
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
  chatStore = inject(ChatStore);
  route = inject(ActivatedRoute);
  router = inject(Router);
  aiService = inject(Ai);
  authService = inject(AuthService);
  jobService = inject(JobsService);
  private dialog = inject(MatDialog);

  inputText = signal<string>('');
  attachedFiles = signal<AttachedFile[]>([]);
  isTyping = signal<boolean>(false);
  isDragOver = signal<boolean>(false);
  showJobs = computed(() => this.stateStore.chatShowJobs());
  telegramLink = signal<string>('');

  matchedJobs = computed(() => this.stateStore.chatMatchedJobs());
  aiSummary = computed(() => this.stateStore.chatAiSummary());
  aiDetectedRole = computed(() => this.stateStore.chatAiDetectedRole());
  aiLocationPreference = computed(() => this.stateStore.chatAiLocationPreference());
  aiPrimarySkills = computed(() => this.stateStore.chatAiPrimarySkills());

  cvSummary = computed(() => this.stateStore.userCv()?.summary);

  maxFileSizeMB = 10;
  allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  constructor() {
    // Automatically manage attachedFiles representing current CV in StateStore
    effect(() => {
      const cv = this.stateStore.userCv();
      if (!cv) {
        untracked(() => {
          this.attachedFiles.update(files => files.filter(f => f.id !== '__cv__'));
        });
        return;
      }

      const hasRealFile = untracked(() => {
        const current = this.attachedFiles().find(f => f.id === '__cv__');
        return current && current.file.size > 0;
      });

      if (hasRealFile) return;

      const fileName = cv.originalName ?? 'CV.pdf';
      const mimeType = cv.mimeType ?? 'application/pdf';
      const placeholder = new File([], fileName, { type: mimeType });
      const cvAttachment: AttachedFile = {
        id: '__cv__',
        name: fileName,
        size: cv.size ?? 0,
        type: mimeType,
        url: '',
        file: placeholder,
      };

      untracked(() => {
        this.attachedFiles.update(files => [
          cvAttachment,
          ...files.filter(f => f.id !== '__cv__'),
        ]);
      });
    });

  }

  ngOnInit() {
    //this.stateStore.getCv();
    //this.stateStore.loadProfile();
  }

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.processFiles(Array.from(input.files));
      input.value = '';
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave() {
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files) this.processFiles(Array.from(files));
  }

  processFiles(files: File[]) {
    if (!files.length) return;
    const file = files[0];
    if (!this.allowedTypes.includes(file.type)) return;
    if (file.size > this.maxFileSizeMB * 1024 * 1024) return;

    const id = '__cv__';
    const newFile: AttachedFile = {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file),
      file: file
    };
    this.attachedFiles.update(current => [
      newFile,
      ...current.filter(f => f.id !== id)
    ]);

    this.stateStore.uploadCv(file);
  }

  removeAttachment(id: string) {
    this.attachedFiles.update(files => files.filter(f => f.id !== id));
    this.stateStore.deleteCv();
  }

  getFileIcon(type: string): string {
    if (type === 'application/pdf') return '📄';
    if (type.includes('word')) return '📝';
    return '📎';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  setPrompt(prompt: string) {
    this.inputText.set(prompt);
  }

  async search() {
    if (this.isTyping() || this.stateStore.cvLoading()) return;

    const query = this.inputText().trim();
    if (query) {
      const existing = this.stateStore.searchQuery() ?? [];
      if (!existing.includes(query)) {
        this.stateStore.updateSearchQueries([...existing, query]);
      }
    }

    this.searchState = 'searching';
    const startTime = Date.now();
    this.isTyping.set(true);

    try {
      const res: any = await firstValueFrom(this.aiService.searchJobsWithAi());
      this.stateStore.getCv();

      const jobs = res?.response?.topJobs || res?.response || [];
      const comment = res?.comment || res?.response?.summary || '';

      let role = '';
      let location = '';
      let skills: string[] = [];

      const profile = res?.response?.candidateProfile;
      if (profile) {
        role = profile.detectedRole || '';
        location = profile.locationPreference || '';
        skills = profile.primarySkills || [];
      } else {
        const cvSummary = this.stateStore.userCv()?.summary;
        role = cvSummary?.detectedRole || '';
        location = cvSummary?.locationPreference || '';
        skills = cvSummary?.primarySkills || [];
      }

      const elapsedTime = Date.now() - startTime;
      const minDuration = 1000;
      const delay = Math.max(0, minDuration - elapsedTime);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      this.stateStore.updateChatSearchResults(jobs, comment, role, location, skills, true);

      if (Array.isArray(jobs) && jobs.length > 0) {
        const userId = this.stateStore.profile().id;
        const payload = jobs.map((job: any) => ({
          userId,
          jobId: job.id,
          vacancy: job.vacancy,
          location: job.location,
          company: job.company,
          match: job.match,
          salaryRange: job.salaryRange,
        }));
        await firstValueFrom(this.jobService.markAsSentBulk(payload));
      }

      this.searchState = 'burst';
      setTimeout(() => {
        if (this.searchState === 'burst') {
          this.searchState = 'idle';
        }
      }, 600);

    } catch (err) {
      console.error('Job search failed:', err);
      this.searchState = 'idle';
    } finally {
      this.isTyping.set(false);
    }
  }

  async generateTelegramToken() {
    const res = await this.authService.generateTelegramToken();
    this.telegramLink.set(`${environment.telegramUrl}?start=${res}`);
    if (res) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        window.location.href = this.telegramLink();
      } else {
        this.openDialog(this.telegramLink());
      }
    }
  }

  openDialog(link: string) {
    const dialogRef = this.dialog.open(QrModal, {
      width: '400px',
      disableClose: true,
      autoFocus: false,
      data: { telegramLink: link },
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.stateStore.loadProfile();
      }
    });
  }

  openEmailVerificationDialog() {
    const email = this.stateStore.profile().email;
    if (!email) return;

    const dialogRef = this.dialog.open(EmailVerifyModal, {
      width: '440px',
      disableClose: true,
      autoFocus: false,
      data: { email }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.stateStore.loadProfile();
      }
    });
  }

  openUpgradeModal() {
    this.dialog.open(SubscriptionModal, {
      width: '560px',
      maxWidth: '95vw',
      panelClass: 'subscription-dialog',
      disableClose: false,
      autoFocus: false,
    });
  }

  addKeyword(input: HTMLInputElement) {
    const value = input.value?.trim();
    if (!value) return;
    const existing = this.stateStore.searchQuery() ?? [];
    if (!existing.includes(value)) {
      this.stateStore.updateSearchQueries([...existing, value]);
    }
    input.value = '';
  }

  removeKeyword(index: number) {
    const existing = this.stateStore.searchQuery() ?? [];
    this.stateStore.updateSearchQueries(existing.filter((_: any, i: number) => i !== index));
  }
}

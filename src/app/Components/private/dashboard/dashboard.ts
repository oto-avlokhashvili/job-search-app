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
import { DashboardStore } from '../../../Store/dashboard.store';
import { ActivatedRoute, Router } from '@angular/router';
import { Ai } from '../../../Core/Services/ai';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { QrModal } from '../qr-modal/qr-modal';
import { EmailVerifyModal } from './email-verify-modal/email-verify-modal';
import { SubscriptionModal } from '../private-layout/subscription-modal/subscription-modal';
import { AuthService } from '../../../Core/Services/auth-service';
import { environment } from '../../../../environments/environment';
import { JobsService } from '../../../Core/Services/jobs-service';
import { extractSalary } from '../../../Core/Utils/salary-extractor';

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
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('fileInput') private fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('particleCanvas') particleCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('searchContainer') searchContainerRef!: ElementRef;

  stateStore = inject(StateStore);
  dashboardStore = inject(DashboardStore);
  route = inject(ActivatedRoute);
  router = inject(Router);
  aiService = inject(Ai);
  authService = inject(AuthService);
  jobService = inject(JobsService);
  private dialog = inject(MatDialog);
  private ngZone = inject(NgZone);

  private animationFrameId: number | null = null;
  searchState: 'idle' | 'searching' | 'burst' = 'idle';

  inputText = signal<string>('');
  attachedFiles = signal<AttachedFile[]>([]);
  isTyping = signal<boolean>(false);
  isDragOver = signal<boolean>(false);
  telegramLink = signal<string>('');
  showProBenefits = signal<boolean>(true);
  isBannerDismissed = signal<boolean>(false);
  isKeywordsLoading = signal<boolean>(false);
  isAddingKeyword = signal<boolean>(false);
  deletingKeywordIndex = signal<number | null>(null);

  // Accordion state management: search queries (params) open by default on desktop & mobile, others shrinked
  openedAccordions = signal<{ [key: string]: boolean }>({
    profile: false,
    cvAnalysis: false,
    params: true,
    alerts: false,
  });

  toggleAccordion(key: 'profile' | 'cvAnalysis' | 'params' | 'alerts') {
    this.openedAccordions.update(curr => ({
      ...curr,
      [key]: !curr[key],
    }));
  }

  isAccordionOpen(key: 'profile' | 'cvAnalysis' | 'params' | 'alerts'): boolean {
    return !!this.openedAccordions()[key];
  }

  // Quick suggestions for search queries
  suggestedRoles = [
    'Software Engineer',
    'Frontend Developer',
    'Backend Developer',
    'Full Stack',
    'Product Manager',
    'UI/UX Designer',
    'Data Analyst',
    'DevOps',
  ];

  // Computed Onboarding State
  isOnboardingCompleted = computed(() => this.stateStore.isOnboardingCompleted());
  onboardingPercentage = computed(() => this.stateStore.onboardingPercentage());
  firstIncompleteStep = computed(() => this.stateStore.firstIncompleteStep());
  hasCvStep = computed(() => this.stateStore.hasCvStep());
  hasInfoStep = computed(() => this.stateStore.hasInfoStep());
  hasNotificationStep = computed(() => this.stateStore.hasNotificationStep());
  hasSubscriptionStep = computed(() => this.stateStore.hasSubscriptionStep());
  isOnboardingLoading = computed(() => !this.stateStore.profileLoaded() || !this.stateStore.cvLoaded() || this.stateStore.cvLoading());

  nextPendingStepHint = computed(() => {
    if (!this.hasSubscriptionStep()) return 'შემდეგი ნაბიჯი: სააბონენტო პაკეტის შერჩევა';
    if (!this.hasCvStep()) return 'შემდეგი ნაბიჯი: CV-ს ატვირთვა';
    if (!this.hasInfoStep()) return 'შემდეგი ნაბიჯი: პირადი მონაცემები';
    if (!this.hasNotificationStep()) return 'შემდეგი ნაბიჯი: შეტყობინებების გააქტიურება';
    return 'პროფილი სრულად შევსებულია!';
  });

  // Jobs and AI Context
  showJobs = computed(() => this.stateStore.chatShowJobs());
  matchedJobs = computed(() => {
    const jobs = this.stateStore.chatMatchedJobs();
    return jobs.map(j => ({
      ...j,
      salaryRange: extractSalary(j),
    }));
  });

  aiSummary = computed(() => this.stateStore.chatAiSummary());
  aiDetectedRole = computed(() => this.stateStore.chatAiDetectedRole() || this.stateStore.userCv()?.summary?.detectedRole || '');
  aiLocationPreference = computed(() => this.stateStore.chatAiLocationPreference() || this.stateStore.userCv()?.summary?.locationPreference || '');
  aiPrimarySkills = computed(() => {
    const chatSkills = this.stateStore.chatAiPrimarySkills();
    if (chatSkills && chatSkills.length > 0) return chatSkills;
    return this.stateStore.userCv()?.summary?.primarySkills || [];
  });

  cvSummary = computed(() => this.stateStore.userCv()?.summary);

  maxFileSizeMB = 10;
  allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  constructor() {
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
    this.stateStore.ensureDataLoaded();
  }

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => this.initParticles());
  }

  ngOnDestroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private initParticles() {
    if (!this.particleCanvasRef) return;
    const canvas = this.particleCanvasRef.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 100;
    interface Particle {
      x: number; y: number;
      r: number; speed: number;
      opacity: number; drift: number;
      color: string;
      vx?: number;
      vy?: number;
    }

    const colors = [
      'rgba(11,96,150,',
      'rgba(91,155,213,',
      'rgba(56,189,248,',
      'rgba(99,102,241,',
      'rgba(22,47,80,',
    ];

    const make = (initial: boolean = false): Particle => {
      const w = canvas.width || window.innerWidth;
      const h = canvas.height || window.innerHeight;
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : h + Math.random() * 30,
        r: Math.random() * 2.6 + 1.2,
        speed: Math.random() * 0.9 + 0.4,
        opacity: Math.random() * 0.5 + 0.25,
        drift: (Math.random() - 0.5) * 0.8,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: 0,
        vy: 0,
      };
    };

    const particles: Particle[] = Array.from({ length: COUNT }, () => make(true));

    const getContainerBounds = () => {
      const container = this.searchContainerRef?.nativeElement;
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

    let bounds = getContainerBounds();
    window.addEventListener('resize', () => {
      resize();
      bounds = getContainerBounds();
    });

    let lastState: 'idle' | 'searching' | 'burst' = 'idle';

    const draw = () => {
      if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
        resize();
        bounds = getContainerBounds();
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const state = this.searchState;

      if (state === 'searching') {
        bounds = getContainerBounds();
      }

      if (state === 'burst' && lastState !== 'burst') {
        bounds = getContainerBounds();
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

  triggerFileInput() {
    this.fileInput?.nativeElement?.click();
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
      file: file,
    };
    this.attachedFiles.update(current => [
      newFile,
      ...current.filter(f => f.id !== id),
    ]);

    this.stateStore.uploadCv(file);
  }

  removeAttachment(id: string) {
    this.attachedFiles.update(files => files.filter(f => f.id !== id));
    this.stateStore.deleteCv();
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  getCompanyInitials(name: string): string {
    if (!name) return 'CO';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  getCompanyGradient(name: string): string {
    const gradients = [
      'linear-gradient(135deg, #0b6096 0%, #1e40af 100%)',
      'linear-gradient(135deg, #059669 0%, #047857 100%)',
      'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
      'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
      'linear-gradient(135deg, #db2777 0%, #be185d 100%)',
      'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = (name.charCodeAt(i) + ((hash << 5) - hash)) | 0;
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  }

  async search() {
    if (this.isTyping() || this.stateStore.cvLoading()) return;

    this.showProBenefits.set(false);

    const query = this.inputText().trim();
    if (query) {
      const existing = this.stateStore.searchQuery() ?? [];
      if (!existing.includes(query)) {
        this.stateStore.updateSearchQueries([...existing, query]);
      }
      this.inputText.set('');
    }

    this.searchState = 'searching';
    const startTime = Date.now();
    this.isTyping.set(true);

    try {
      const res: any = await firstValueFrom(this.aiService.searchJobsWithAi());
      this.stateStore.getCv(true);

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
      const minDuration = 800;
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
        this.stateStore.updateProfile(this.stateStore.profile()?.id, { receiveMessages: true });
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
      data: { email },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.stateStore.updateProfile(this.stateStore.profile()?.id, { receiveMessages: true });
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

  async addKeyword(input: HTMLInputElement) {
    const value = input.value?.trim();
    if (!value) return;
    input.value = '';
    const existing = this.stateStore.searchQuery() ?? [];
    if (existing.includes(value)) return;

    const nextQueries = [...existing, value];
    // 1. Immediately update UI
    this.stateStore.setSearchQueries(nextQueries);
    // 2. Trigger loading
    this.isKeywordsLoading.set(true);
    this.isAddingKeyword.set(true);

    try {
      await this.stateStore.updateSearchQueries(nextQueries, false);
    } catch (err) {
      console.error('Failed to save search queries:', err);
    } finally {
      this.isKeywordsLoading.set(false);
      this.isAddingKeyword.set(false);
    }
  }

  async addSuggestedKeyword(keyword: string) {
    const existing = this.stateStore.searchQuery() ?? [];
    if (existing.includes(keyword)) return;

    const nextQueries = [...existing, keyword];
    // 1. Immediately update UI
    this.stateStore.setSearchQueries(nextQueries);
    // 2. Trigger loading
    this.isKeywordsLoading.set(true);
    this.isAddingKeyword.set(true);

    try {
      await this.stateStore.updateSearchQueries(nextQueries, false);
    } catch (err) {
      console.error('Failed to save suggested query:', err);
    } finally {
      this.isKeywordsLoading.set(false);
      this.isAddingKeyword.set(false);
    }
  }

  async removeKeyword(index: number) {
    const existing = this.stateStore.searchQuery() ?? [];
    const nextQueries = existing.filter((_: any, i: number) => i !== index);
    // 1. Immediately update UI
    this.stateStore.setSearchQueries(nextQueries);
    // 2. Trigger loading
    this.isKeywordsLoading.set(true);
    this.deletingKeywordIndex.set(index);

    try {
      await this.stateStore.updateSearchQueries(nextQueries, false);
    } catch (err) {
      console.error('Failed to delete query:', err);
    } finally {
      this.isKeywordsLoading.set(false);
      this.deletingKeywordIndex.set(null);
    }
  }

  handleOnboardingClick(targetStep?: number) {
    if (this.isOnboardingCompleted()) {
      this.router.navigate(['/private/profile']);
    } else {
      const step = targetStep || this.firstIncompleteStep();
      this.router.navigate(['/private/onboarding'], {
        queryParams: step ? { step } : undefined,
      });
    }
  }

  dismissOnboardingBanner() {
    this.isBannerDismissed.set(true);
  }
}

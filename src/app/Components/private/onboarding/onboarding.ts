import { Component, OnInit, inject, signal, computed, effect, ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { QRCodeComponent } from 'angularx-qrcode';
import { StateStore } from '../../../Store/state.store';
import { AuthService } from '../../../Core/Services/auth-service';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { ThemeService } from '../../../Core/Services/theme.service';
import { environment } from '../../../../environments/environment';

export interface StepItem {
  number: number;
  id: 'info' | 'cv' | 'review' | 'notifications' | 'payment';
  title: string;
  subtitle: string;
  icon: string;
}

export interface PricingPlan {
  key: 'BASIC' | 'PRO' | 'PREMIUM';
  name: string;
  price: string;
  period: string;
  badge?: string;
  isPopular?: boolean;
  features: string[];
}

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, QRCodeComponent],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class Onboarding implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('particleCanvas') particleCanvasRef!: ElementRef<HTMLCanvasElement>;

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private ngZone = inject(NgZone);
  private animationFrameId: number | null = null;
  authService = inject(AuthService);
  stateStore = inject(StateStore);
  private alertify = inject(AlertifyService);
  themeService = inject(ThemeService);

  currentStep = signal<number>(1);
  totalSteps = 5;

  steps: StepItem[] = [
    { number: 1, id: 'cv', title: 'CV-ს ატვირთვა', subtitle: 'რეზიუმეს AI ანალიზი', icon: 'upload_file' },
    { number: 2, id: 'info', title: 'პირადი მონაცემები', subtitle: 'სახელი, გვარი & Keywords', icon: 'person' },
    { number: 3, id: 'notifications', title: 'შეტყობინებები', subtitle: 'Telegram & Email არხები', icon: 'notifications_active' },
    { number: 4, id: 'review', title: 'გადამოწმება', subtitle: 'მონაცემების შემოწმება', icon: 'fact_check' },
    { number: 5, id: 'payment', title: 'გამოწერა & გადახდა', subtitle: 'სააბონენტო პაკეტი', icon: 'payments' },
  ];

  // Step 1: Info Form
  infoFormSubmitted = signal<boolean>(false);
  infoForm = this.fb.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: [{ value: '', disabled: true }],
  });

  keywordInput = signal<string>('');
  popularKeywords = [
    'Frontend Developer',
    'Full Stack',
    'Backend Developer',
    'UI/UX Designer',
    'Project Manager',
    'DevOps Engineer',
    'Data Analyst',
    'QA Engineer'
  ];

  // Step 2: CV Upload State
  isDragOver = signal<boolean>(false);
  maxFileSizeMB = 10;
  allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  // Step 4: Notifications State
  telegramLink = signal<string>('');
  telegramLoading = signal<boolean>(false);
  showTelegramQR = signal<boolean>(false);

  emailVerificationCode = signal<string>('');
  emailCodeSent = signal<boolean>(false);
  emailVerifying = signal<boolean>(false);
  emailResendCooldown = signal<number>(0);
  emailSuccessMsg = signal<string>('');
  emailErrorMsg = signal<string>('');
  private emailTimer: any = null;

  // Step 5: Payment & Plans
  selectedPlan = signal<'BASIC' | 'PRO' | 'PREMIUM'>('PRO');
  isProcessingPayment = signal<boolean>(false);
  isCompleted = signal<boolean>(false);

  plans: PricingPlan[] = [
    {
      key: 'BASIC',
      name: 'სტანდარტული',
      price: '0₾',
      period: '/სამუდამოდ',
      features: [
        '1 CV-ის შენახვა',
        'სტანდარტული ვაკანსიების ძიება',
        'ელ-ფოსტის შეტყობინებები',
        'ბაზისური ფილტრაცია',
      ],
    },
    {
      key: 'PRO',
      name: 'Pro პაკეტი',
      price: '8₾',
      period: '/თვე',
      badge: 'რეკომენდებული',
      isPopular: true,
      features: [
        'შეუზღუდავი AI ძიება & ანალიზი',
        'AI რეზიუმეს ოპტიმიზაცია & Match ქულები',
        'მყისიერი Telegram & Email შეტყობინებები',
        'პრიორიტეტული ახალი ვაკანსიების შეტყობინება',
        'სტატისტიკა და შედარებითი ანალიზი',
      ],
    },
    {
      key: 'PREMIUM',
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      features: [
        'API ინტეგრაცია',
        'პერსონალური მენეჯერი',
        'გუნდური მართვა & მრავალპროფილიანი წვდომა',
        'ყველა Pro შესაძლებლობა',
      ],
    },
  ];

  userCv = computed(() => this.stateStore.userCv());
  cvLoading = computed(() => this.stateStore.cvLoading());
  profile = computed(() => this.stateStore.profile());
  searchQueries = computed(() => this.stateStore.searchQuery() || []);
  isEmailVerified = computed(() => !!this.profile()?.isEmailVerified);
  isTelegramConnected = computed(() => !!this.profile()?.telegramChatId);

  candidateFullName = computed(() => {
    const f = this.infoForm.get('firstName')?.value?.trim();
    const l = this.infoForm.get('lastName')?.value?.trim();
    if (f || l) return `${f || ''} ${l || ''}`.trim();
    const p = this.profile();
    if (p?.firstName || p?.lastName) return `${p.firstName || ''} ${p.lastName || ''}`.trim();
    return 'ახალი კანდიდატი';
  });

  candidateInitials = computed(() => {
    const name = this.candidateFullName();
    if (!name || name === 'ახალი კანდიდატი') return 'AI';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  });

  matchConfidence = computed(() => {
    let score = 70;
    if (this.searchQueries().length > 0) score += 10;
    if (this.userCv()) score += 15;
    if (this.profile()?.receiveMessages) score += 5;
    return Math.min(score, 98);
  });

  completionPercentage = computed(() => {
    return Math.round((this.currentStep() / this.totalSteps) * 100);
  });

  constructor() {
    effect(() => {
      const p = this.profile();
      const loaded = this.stateStore.profileLoaded();
      if (loaded && p) {
        this.infoForm.patchValue({
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          email: p.email || '',
        });
        if (p.subscription && ['BASIC', 'PRO', 'PREMIUM'].includes(p.subscription)) {
          this.selectedPlan.set(p.subscription as any);
        }
      }
    });
  }

  async ngOnInit() {
    if (!this.stateStore.profileLoaded() || !this.profile()?.id) {
      await this.stateStore.loadProfile();
    }
    if (!this.stateStore.userCv()) {
      this.stateStore.getCv();
    }
  }

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => this.initParticles());
  }

  ngOnDestroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.emailTimer) {
      clearInterval(this.emailTimer);
    }
  }

  private initParticles() {
    const canvas = this.particleCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 60;
    interface Particle {
      x: number;
      y: number;
      r: number;
      speed: number;
      opacity: number;
      drift: number;
      color: string;
    }

    const colors = ['rgba(11,96,150,', 'rgba(151,174,213,', 'rgba(208,188,255,', 'rgba(76,215,246,'];

    const make = (): Particle => ({
      x: Math.random() * canvas.width,
      y: canvas.height + Math.random() * 40,
      r: Math.random() * 2.2 + 1.2,
      speed: Math.random() * 0.9 + 0.3,
      opacity: Math.random() * 0.45 + 0.2,
      drift: (Math.random() - 0.5) * 0.8,
      color: colors[Math.floor(Math.random() * colors.length)],
    });

    const particles: Particle[] = Array.from({ length: COUNT }, make);

    const draw = () => {
      if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
        resize();
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
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

  // ── Navigation Between Steps ──────────────────────────────
  goToStep(step: number) {
    if (step < 1 || step > this.totalSteps) return;

    // Validate if moving forward from step 2 (Personal Info)
    if (this.currentStep() === 2 && step > 2) {
      this.infoFormSubmitted.set(true);
      if (this.infoForm.invalid) {
        this.alertify.error('გთხოვთ შეავსოთ სახელი და გვარი');
        return;
      }
      this.savePersonalInfo();
    }

    this.currentStep.set(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  nextStep() {
    this.goToStep(this.currentStep() + 1);
  }

  prevStep() {
    this.goToStep(this.currentStep() - 1);
  }

  // ── Step 2: Personal Info & Keywords ─────────────────────
  savePersonalInfo() {
    if (this.infoForm.invalid) return;
    const val = this.infoForm.getRawValue();
    const payload = {
      firstName: val.firstName?.trim(),
      lastName: val.lastName?.trim(),
    };
    if (this.profile()?.id) {
      this.stateStore.updateLocalProfile(payload);
    }
  }

  addKeyword(keyword?: string) {
    const term = (keyword || this.keywordInput()).trim();
    if (!term) return;

    const current = this.searchQueries();
    if (!current.includes(term)) {
      const updated = [...current, term];
      this.stateStore.updateSearchQueries(updated);
    }
    this.keywordInput.set('');
  }

  removeKeyword(index: number) {
    const current = this.searchQueries();
    const updated = current.filter((_, i) => i !== index);
    this.stateStore.updateSearchQueries(updated);
  }

  // ── Step 1: CV Upload Handlers ───────────────────────────
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
    if (files && files.length > 0) {
      this.uploadFile(files[0]);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.uploadFile(input.files[0]);
      input.value = '';
    }
  }

  uploadFile(file: File) {
    if (!this.allowedTypes.includes(file.type)) {
      this.alertify.error('გთხოვთ ატვირთოთ PDF ან Word (DOC/DOCX) ფორმატი');
      return;
    }
    if (file.size > this.maxFileSizeMB * 1024 * 1024) {
      this.alertify.error('ფაილის ზომა არ უნდა აღემატებოდეს 10MB-ს');
      return;
    }

    this.stateStore.uploadCv(file);
    this.alertify.success('CV წარმატებით იტვირთება...');
  }

  deleteCv() {
    this.stateStore.deleteCv();
    this.alertify.message('CV წაშლილია');
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ── Step 3: Notification Handlers ────────────────────────
  toggleReceiveMessages(event: any) {
    const checked = event.target.checked;
    if (this.profile()?.id) {
      this.stateStore.updateLocalProfile({ receiveMessages: checked });
      this.alertify.success(checked ? 'შეტყობინებები გააქტიურებულია' : 'შეტყობინებები გამორთულია');
    }
  }

  async connectTelegram() {
    this.telegramLoading.set(true);
    try {
      const res = await this.authService.generateTelegramToken();
      const link = `${environment.telegramUrl}?start=${res}`;
      this.telegramLink.set(link);

      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        window.open(link, '_blank');
      } else {
        this.showTelegramQR.set(true);
      }
    } catch (err) {
      console.error('Error generating telegram token:', err);
      this.alertify.error('Telegram-ის ტოკენის გენერაცია ვერ მოხერხდა');
    } finally {
      this.telegramLoading.set(false);
    }
  }

  confirmTelegramConnected() {
    if (this.profile()?.id) {
      this.stateStore.updateLocalProfile({ receiveMessages: true });
      this.alertify.success('Telegram წარმატებით დაკავშირდა');
      this.showTelegramQR.set(false);
    }
  }

  async sendEmailVerificationCode() {
    const email = this.profile()?.email;
    if (!email) return;

    if (this.emailResendCooldown() > 0) return;

    this.emailVerifying.set(true);
    this.emailErrorMsg.set('');
    this.emailSuccessMsg.set('');

    try {
      await this.authService.resendVerification(email);
      this.emailCodeSent.set(true);
      this.emailSuccessMsg.set('დადასტურების კოდი გაიგზავნა თქვენს ელ-ფოსტაზე!');
      this.startEmailCooldown();
    } catch (err: any) {
      console.error('Email verification send error:', err);
      this.emailErrorMsg.set(err.error?.message || 'კოდის გაგზავნა ვერ მოხერხდა');
    } finally {
      this.emailVerifying.set(false);
    }
  }

  async verifyEmailCode() {
    const email = this.profile()?.email;
    const code = this.emailVerificationCode().trim();
    if (!email || !code || code.length !== 6) {
      this.emailErrorMsg.set('გთხოვთ შეიყვანოთ 6-ნიშნა კოდი');
      return;
    }

    this.emailVerifying.set(true);
    this.emailErrorMsg.set('');
    this.emailSuccessMsg.set('');

    try {
      await this.authService.verifyEmail(email, code);
      this.emailSuccessMsg.set('ელ-ფოსტა წარმატებით დადასტურდა!');
      if (this.profile()?.id) {
        this.stateStore.updateLocalProfile({ isEmailVerified: true, receiveMessages: true });
      }
      this.alertify.success('ელ-ფოსტა წარმატებით დადასტურდა!');
    } catch (err: any) {
      console.error('Email verification error:', err);
      this.emailErrorMsg.set(err.error?.message || 'არასწორი კოდი. გთხოვთ სცადოთ ხელახლა.');
    } finally {
      this.emailVerifying.set(false);
    }
  }

  private startEmailCooldown() {
    this.emailResendCooldown.set(60);
    if (this.emailTimer) clearInterval(this.emailTimer);
    this.emailTimer = setInterval(() => {
      const cur = this.emailResendCooldown();
      if (cur <= 1) {
        this.emailResendCooldown.set(0);
        clearInterval(this.emailTimer);
      } else {
        this.emailResendCooldown.set(cur - 1);
      }
    }, 1000);
  }

  // ── Step 5: Payment & Finalization ───────────────────────
  selectPlan(key: 'BASIC' | 'PRO' | 'PREMIUM') {
    this.selectedPlan.set(key);
  }

  async finishAndPay() {
    const plan = this.selectedPlan();
    this.isProcessingPayment.set(true);

    try {
      if (this.profile()?.id) {
        await this.stateStore.updateProfile(this.profile().id, { subscription: plan });
        await this.stateStore.loadProfile(true);
      }

      // Small delay for smooth UX transition
      await new Promise(res => setTimeout(res, 800));

      this.isCompleted.set(true);
      this.alertify.success('გილოცავთ! თქვენი პროფილი მზად არის');
    } catch (err) {
      console.error('Error completing onboarding:', err);
      this.alertify.error('დაფიქსირდა შეცდომა');
    } finally {
      this.isProcessingPayment.set(false);
    }
  }

  navigateToDashboard() {
    this.router.navigate(['/private/dashboard']);
  }
}

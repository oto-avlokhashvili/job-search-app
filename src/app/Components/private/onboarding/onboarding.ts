import { Component, OnInit, inject, signal, computed, effect, ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { QRCodeComponent } from 'angularx-qrcode';
import { firstValueFrom } from 'rxjs';
import { StateStore } from '../../../Store/state.store';
import { AuthService } from '../../../Core/Services/auth-service';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { ThemeService } from '../../../Core/Services/theme.service';
import { Cv } from '../../../Core/Services/cv';
import { Users } from '../../../Core/Services/users';
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
  disabled?: boolean;
  features: string[];
}

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, QRCodeComponent, MatDialogModule],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class Onboarding implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('particleCanvas') particleCanvasRef!: ElementRef<HTMLCanvasElement>;

  dialogRef = inject(MatDialogRef<Onboarding>, { optional: true });
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private ngZone = inject(NgZone);
  private animationFrameId: number | null = null;
  authService = inject(AuthService);
  stateStore = inject(StateStore);
  private cvService = inject(Cv);
  private usersService = inject(Users);
  private alertify = inject(AlertifyService);
  themeService = inject(ThemeService);

  private initialStepResolved = false;
  isInitializing = signal<boolean>(true);

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
    email: [''],
  });

  keywordInput = signal<string>('');
  keywordLoading = signal<boolean>(false);
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
      name: 'Basic პაკეტი',
      price: '0₾',
      period: '/სამუდამოდ',
      badge: 'უფასო',
      features: [
        'საბაზისო AI ვაკანსიების ძიება',
        'CV-ს ატვირთვა და AI ანალიზი',
        'დღიური ვაკანსიების დაიჯესტი',
        'ელ-ფოსტის შეტყობინებები',
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
      disabled: true,
      badge: 'მალე დაემატება',
      features: [
        'API ინტეგრაცია',
        'პერსონალური მენეჯერი',
        'გუნდური მართვა & მრავალპროფილიანი წვდომა',
        'ყველა Pro შესაძლებლობა',
      ],
    },
  ];

  userCv = computed(() => this.stateStore.userCv());
  isUploadingCv = signal<boolean>(false);
  cvLoading = computed(() => this.stateStore.cvLoading() || this.isUploadingCv());
  profile = computed(() => this.stateStore.profile());
  searchQueries = computed(() => this.stateStore.searchQuery() || []);
  isEmailVerified = computed(() => !!this.profile()?.isEmailVerified);
  isTelegramConnected = computed(() => !!this.profile()?.telegramChatId);
  hasSubscription = computed(() => {
    return this.isCompleted();
  });

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
    let count = 0;
    for (let i = 1; i <= this.totalSteps; i++) {
      if (this.isStepValid(i)) count++;
    }
    return Math.round((count / this.totalSteps) * 100);
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
        if (p.subscription && ['PRO', 'PREMIUM'].includes(p.subscription)) {
          this.selectedPlan.set(p.subscription as any);
        }
      }
    });
  }

  async ngOnInit() {
    try {
      if (!this.stateStore.profileLoaded() || !this.profile()?.id) {
        await this.stateStore.loadProfile();
      }
      if (!this.stateStore.userCv()) {
        await this.stateStore.getCv();
      }

      const p = this.profile();
      if (p) {
        this.infoForm.patchValue({
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          email: p.email || '',
        });
        if (p.subscription && ['PRO', 'PREMIUM'].includes(p.subscription)) {
          this.selectedPlan.set(p.subscription as any);
        }
      }

      this.determineInitialStep();
    } catch (err) {
      console.error('Error initializing onboarding:', err);
      this.determineInitialStep();
    } finally {
      this.isInitializing.set(false);
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

  // ── Navigation Between Steps & Validations ───────────────
  determineInitialStep() {
    if (this.initialStepResolved) return;
    this.initialStepResolved = true;

    if (!this.isStepValid(1)) {
      this.currentStep.set(1);
    } else if (!this.isStepValid(2)) {
      this.currentStep.set(2);
    } else if (!this.isStepValid(3)) {
      this.currentStep.set(3);
    } else if (!this.isStepValid(5)) {
      this.currentStep.set(5);
    } else {
      // If user has Pro/Premium subscription and all steps are complete:
      if (!this.dialogRef) {
        if (!this.isCompleted()) {
          this.router.navigate(['/private/dashboard'], { replaceUrl: true });
        } else {
          this.currentStep.set(5);
        }
      } else {
        this.currentStep.set(1);
      }
    }
  }

  isStepValid(step: number): boolean {
    if (step === 1) {
      return !!this.userCv() && !this.cvLoading();
    }
    if (step === 2) {
      const f = this.infoForm.get('firstName')?.value?.trim() || this.profile()?.firstName?.trim();
      const l = this.infoForm.get('lastName')?.value?.trim() || this.profile()?.lastName?.trim();
      return !!f && !!l && this.searchQueries().length > 0;
    }
    if (step === 3) {
      return !!this.profile()?.receiveMessages && (this.isEmailVerified() || this.isTelegramConnected());
    }
    if (step === 4) {
      return this.isStepValid(1) && this.isStepValid(2) && this.isStepValid(3);
    }
    if (step === 5) {
      return this.hasSubscription();
    }
    return true;
  }

  canAccessStep(targetStep: number): boolean {
    if (targetStep <= this.currentStep()) {
      return true;
    }
    if (targetStep === 2) return this.isStepValid(1);
    if (targetStep === 3) return this.isStepValid(1) && this.isStepValid(2);
    if (targetStep === 4) return this.isStepValid(1) && this.isStepValid(2) && this.isStepValid(3);
    if (targetStep === 5) return this.isStepValid(1) && this.isStepValid(2) && this.isStepValid(3);
    return true;
  }

  validateStep(step: number): boolean {
    if (step === 1) {
      if (this.cvLoading()) {
        this.alertify.warning('გთხოვთ დაელოდოთ CV-ს ატვირთვას...');
        return false;
      }
      if (!this.userCv()) {
        this.alertify.error('გთხოვთ ატვირთოთ CV გასაგრძელებლად');
        return false;
      }
      return true;
    }

    if (step === 2) {
      this.infoFormSubmitted.set(true);
      if (this.keywordInput().trim()) {
        this.addKeyword();
      }
      if (this.infoForm.invalid) {
        this.alertify.error('გთხოვთ შეავსოთ სახელი და გვარი');
        return false;
      }
      if (this.searchQueries().length === 0) {
        this.alertify.error('გთხოვთ დაამატოთ მინიმუმ ერთი საძიებო სიტყვა / პოზიცია');
        return false;
      }
      this.savePersonalInfo();
      return true;
    }

    if (step === 3) {
      if (!this.profile()?.receiveMessages) {
        this.alertify.error('გთხოვთ ჩართოთ შეტყობინებების მიღება გასაგრძელებლად');
        return false;
      }
      if (!this.isEmailVerified() && !this.isTelegramConnected()) {
        this.alertify.error('გთხოვთ დააკავშიროთ Telegram ან დაადასტუროთ Email');
        return false;
      }
      return true;
    }

    if (step === 4) {
      if (!this.isStepValid(1)) {
        this.alertify.error('გთხოვთ ატვირთოთ CV');
        return false;
      }
      if (!this.isStepValid(2)) {
        this.alertify.error('გთხოვთ შეავსოთ პირადი ინფორმაცია და საძიებო სიტყვები');
        return false;
      }
      if (!this.isStepValid(3)) {
        this.alertify.error('გთხოვთ ჩართოთ შეტყობინებები');
        return false;
      }
      return true;
    }

    return true;
  }

  goToStep(step: number) {
    if (step < 1 || step > this.totalSteps || step === this.currentStep()) return;

    // Validate sequential steps before allowing forward navigation
    if (step > this.currentStep()) {
      for (let s = this.currentStep(); s < step; s++) {
        if (!this.validateStep(s)) {
          return;
        }
      }
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

  async addKeyword(keyword?: string) {
    if (this.keywordLoading()) return;
    const term = (keyword || this.keywordInput()).trim();
    if (!term) return;

    const current = this.searchQueries();
    if (!current.includes(term)) {
      const updated = [...current, term];

      // 1. Instant optimistic update
      this.stateStore.setSearchQueries(updated);
      this.keywordInput.set('');

      // 2. Background sync with server
      this.keywordLoading.set(true);
      try {
        const res: any = await firstValueFrom(this.cvService.updateSearchQueries(updated));
        if (res?.summary?.searchQueries) {
          this.stateStore.setSearchQueries(res.summary.searchQueries);
        }
      } catch (err) {
        console.error('Error adding keyword:', err);
      } finally {
        this.keywordLoading.set(false);
      }
      return;
    }
    this.keywordInput.set('');
  }

  async removeKeyword(index: number) {
    if (this.keywordLoading()) return;
    const current = this.searchQueries();
    const updated = current.filter((_, i) => i !== index);

    // 1. Instant optimistic update
    this.stateStore.setSearchQueries(updated);

    // 2. Background sync with server
    this.keywordLoading.set(true);
    try {
      const res: any = await firstValueFrom(this.cvService.updateSearchQueries(updated));
      if (res?.summary?.searchQueries) {
        this.stateStore.setSearchQueries(res.summary.searchQueries);
      }
    } catch (err) {
      console.error('Error removing keyword:', err);
    } finally {
      this.keywordLoading.set(false);
    }
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

  async uploadFile(file: File) {
    if (!this.allowedTypes.includes(file.type)) {
      this.alertify.error('გთხოვთ ატვირთოთ PDF ან Word (DOC/DOCX) ფორმატი');
      return;
    }
    if (file.size > this.maxFileSizeMB * 1024 * 1024) {
      this.alertify.error('ფაილის ზომა არ უნდა აღემატებოდეს 10MB-ს');
      return;
    }

    // Instant zero-delay loading state
    this.isUploadingCv.set(true);

    try {
      await firstValueFrom(this.cvService.upload(file));
      this.alertify.success('CV წარმატებით აიტვირთა!');
      await this.stateStore.getCv(true);

      if (this.currentStep() === 1) {
        this.goToStep(2);
      }
    } catch (err) {
      console.error('CV upload error:', err);
      this.alertify.error('CV-ს ატვირთვა ვერ მოხერხდა');
    } finally {
      this.isUploadingCv.set(false);
    }
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
  async toggleReceiveMessages(event: any) {
    const checked = event.target.checked;
    if (this.profile()?.id) {
      this.stateStore.updateLocalProfile({ receiveMessages: checked });
      try {
        await this.stateStore.updateProfile(this.profile().id, { receiveMessages: checked });
      } catch (e) {
        console.error('Failed to sync receiveMessages:', e);
      }
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
    const plan = this.plans.find(p => p.key === key);
    if (plan?.disabled) return;
    this.selectedPlan.set(key);
  }

  async finishAndPay() {
    if (this.isProcessingPayment()) return;
    const plan = this.selectedPlan();
    this.isProcessingPayment.set(true);

    try {
      if (this.profile()?.id) {
        const updatedUser: any = await firstValueFrom(this.usersService.getUserById(this.profile().id, { subscription: plan }));
        this.stateStore.updateLocalProfile(updatedUser || { subscription: plan });
      } else {
        this.stateStore.updateLocalProfile({ subscription: plan });
      }

      this.isCompleted.set(true);
      this.alertify.success('გილოცავთ! თქვენი პროფილი მზად არის');
    } catch (err) {
      console.error('Error completing onboarding:', err);
      this.stateStore.updateLocalProfile({ subscription: plan });
      this.isCompleted.set(true);
      this.alertify.success('გილოცავთ! თქვენი პროფილი მზად არის');
    } finally {
      this.isProcessingPayment.set(false);
    }
  }

  closeModal() {
    if (this.dialogRef) {
      this.dialogRef.close(this.isCompleted());
    } else {
      this.router.navigate(['/private/dashboard']);
    }
  }

  navigateToDashboard() {
    if (this.dialogRef) {
      this.dialogRef.close(true);
    } else {
      this.router.navigate(['/private/dashboard']);
    }
  }
}

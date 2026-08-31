import { Component, OnInit, inject, signal, computed, effect, ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { QRCodeComponent } from 'angularx-qrcode';
import { firstValueFrom } from 'rxjs';
import { StateStore } from '../../../Store/state.store';
import { AuthService } from '../../../Core/Services/auth-service';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { ThemeService } from '../../../Core/Services/theme.service';
import { WaitlistService } from '../../../Core/Services/waitlist.service';
import { Cv } from '../../../Core/Services/cv';
import { Users } from '../../../Core/Services/users';
import { environment } from '../../../../environments/environment';
import { QrModal } from '../dashboard/qr-modal/qr-modal';


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
  private dialog = inject(MatDialog);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute, { optional: true });
  private ngZone = inject(NgZone);
  private animationFrameId: number | null = null;
  authService = inject(AuthService);
  stateStore = inject(StateStore);
  waitlistService = inject(WaitlistService);
  private cvService = inject(Cv);
  private usersService = inject(Users);
  private alertify = inject(AlertifyService);
  themeService = inject(ThemeService);


  private initialStepResolved = false;
  isInitializing = signal<boolean>(true);

  currentStep = signal<number>(1);
  totalSteps = 5;

  // Step 1: Payment & Plans
  selectedPlan = signal<'BASIC' | 'PRO' | 'PREMIUM'>('BASIC');
  step1Confirmed = signal<boolean>(false);
  isProcessingPayment = signal<boolean>(false);
  isCompleted = signal<boolean>(false);

  steps = computed<StepItem[]>(() => {
    const isPro = this.selectedPlan() === 'PRO' || this.selectedPlan() === 'PREMIUM';
    return [
      { number: 1, id: 'payment', title: 'სააბონენტო გეგმა', subtitle: 'პაკეტის არჩევა (უფასო / Pro)', icon: 'payments' },
      { number: 2, id: 'cv', title: 'CV-ს ატვირთვა', subtitle: isPro ? 'რეზიუმეს AI ანალიზი' : 'რეზიუმეს ატვირთვა', icon: 'upload_file' },
      { number: 3, id: 'info', title: 'პირადი მონაცემები', subtitle: isPro ? 'სახელი & გვარი (AI Keywords)' : 'სახელი, გვარი & პოზიციები', icon: 'person' },
      { number: 4, id: 'notifications', title: 'შეტყობინებები', subtitle: isPro ? 'Email შეტყობინებები' : 'Telegram შეტყობინებები', icon: 'notifications_active' },
      { number: 5, id: 'review', title: 'გადამოწმება & დასრულება', subtitle: 'მონაცემების შემოწმება', icon: 'fact_check' },
    ];


  });

  // Step 3: Info Form
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
  telegramVerifying = signal<boolean>(false);
  showTelegramQR = signal<boolean>(false);

  emailVerificationCode = signal<string>('');
  emailCodeSent = signal<boolean>(false);
  emailVerifying = signal<boolean>(false);
  emailResendCooldown = signal<number>(0);
  emailSuccessMsg = signal<string>('');
  emailErrorMsg = signal<string>('');
  private emailTimer: any = null;

  plans: PricingPlan[] = [
    {
      key: 'BASIC',
      name: 'Basic პაკეტი',
      price: '0₾',
      period: '/სამუდამოდ',
      badge: 'უფასო',
      features: [
        'CV-ს ატვირთვა',
        'ვაკანსიების ძიება საძიებო სიტყვებით',
        'შეტყობინებების მიღება Telegram-ზე',
        'ბარათის დამატება არ არის საჭირო',
      ],
    },
    {
      key: 'PRO',
      name: 'Pro პაკეტი',
      price: '8₾',
      period: '/თვე',
      badge: 'მალე დაემატება',
      disabled: true,
      isPopular: false,
      features: [
        'CV-ს ატვირთვა',
        'ვაკანსიების შეტყობინებების მიღება Email-ზე',
        'ვაკანსიებისა და CV-ს AI ანალიზი',
        'CV-ზე მორგებული და შეფასებული ვაკანსიების მიღება',
        'საძიებო სიტყვების AI ავტომატური გენერაცია',
      ],
    },
    {
      key: 'PREMIUM',
      name: 'Enterprise (კომპანიებისთვის)',
      price: 'შეთანხმებით',
      period: '',
      disabled: true,
      badge: 'HR & კომპანიები',

      features: [
        'HR & რეკრუტერების პანელი',
        'კანდიდატების AI მოძიება კონკრეტულ ვაკანსიებზე',
        'კანდიდატების CV-ების AI ანალიზი & Match Score',
        'ვაკანსიების მართვა & პირდაპირი კონტაქტი',
        'API ინტეგრაცია & პერსონალური მენეჯერი',
      ],
    },
  ];

  async joinWaitlistFromOnboarding(planKey: string) {
    if (this.waitlistService.isEnrolled(planKey)) {
      this.alertify.success(`თქვენ უკვე დარეგისტრირებული ხართ ${planKey} Waitlist-ში! 🎉`);
      return;
    }
    try {
      const res = await this.waitlistService.join({ plan: planKey, source: 'onboarding' });
      this.alertify.success(res.message || 'გმადლობთ! თქვენ წარმატებით დაემატეთ Waitlist-ში 🎉');
    } catch (e) {
      this.alertify.error('დაფიქსირდა შეცდომა');
    }
  }

  userCv = computed(() => this.stateStore.userCv());

  isUploadingCv = signal<boolean>(false);
  cvLoading = computed(() => this.stateStore.cvLoading() || this.isUploadingCv());
  profile = computed(() => this.stateStore.profile());
  searchQueries = computed(() => this.stateStore.searchQuery() || []);
  isEmailVerified = computed(() => !!this.profile()?.isEmailVerified);
  isTelegramConnected = computed(() => !!this.profile()?.telegramChatId);
  isNotificationToggling = signal<boolean>(false);

  isProPlan = computed(() => this.selectedPlan() === 'PRO' || this.selectedPlan() === 'PREMIUM');

  isCurrentStepBusy = computed(() => {
    const step = this.currentStep();
    if (step === 1) return false;
    if (step === 2) return this.cvLoading();
    if (step === 3) return this.keywordLoading();
    if (step === 4) return this.isNotificationToggling() || this.telegramLoading() || this.emailVerifying();
    return this.isProcessingPayment();
  });

  step4Submitted = signal<boolean>(false);

  canProceedNext = computed(() => {
    const step = this.currentStep();
    if (step === 1) {
      return !!this.selectedPlan();
    }
    if (step === 2) {
      return !this.cvLoading() && !!this.userCv();
    }
    if (step === 3) {
      return !this.keywordLoading();
    }
    if (step === 4) {
      return !this.isNotificationToggling() && !this.telegramLoading() && !this.emailVerifying();
    }
    if (step === 5) {
      return this.isStepValid(1) && this.isStepValid(2) && this.isStepValid(3) && this.isStepValid(4);
    }
    return true;
  });


  hasSubscription = computed(() => {
    const sub = this.profile()?.subscriptionDetails?.plan || this.profile()?.subscription;
    return this.isCompleted() || (!!sub && ['BASIC', 'PRO', 'PREMIUM'].includes(sub));
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
    if (this.isProPlan() || this.searchQueries().length >= 3) score += 10;
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

  async ensureTelegramLink() {
    if (this.telegramLink() || this.isTelegramConnected() || this.telegramLoading()) return;
    this.telegramLoading.set(true);
    try {
      const res = await this.authService.generateTelegramToken();
      if (res) {
        const link = `${environment.telegramUrl}?start=${res}`;
        this.telegramLink.set(link);
      }
    } catch (err) {
      console.error('Error generating telegram token:', err);
    } finally {
      this.telegramLoading.set(false);
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

    const stepParam = Number(this.route?.snapshot?.queryParamMap?.get('step'));
    if (stepParam && stepParam >= 1 && stepParam <= 5 && this.canAccessStep(stepParam)) {
      this.currentStep.set(stepParam);
      return;
    }

    if (!this.isStepValid(1)) {
      this.currentStep.set(1);
    } else if (!this.isStepValid(2)) {
      this.currentStep.set(2);
    } else if (!this.isStepValid(3)) {
      this.currentStep.set(3);
    } else if (!this.isStepValid(4)) {
      this.currentStep.set(4);
    } else if (!this.hasSubscription()) {
      this.currentStep.set(5);
    } else {
      // If user has subscription and all steps are complete:
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
      return this.step1Confirmed() && !!this.selectedPlan();
    }
    if (step === 2) {
      return !!this.userCv() && !this.cvLoading();
    }
    if (step === 3) {
      const f = this.infoForm.get('firstName')?.value?.trim() || this.profile()?.firstName?.trim();
      const l = this.infoForm.get('lastName')?.value?.trim() || this.profile()?.lastName?.trim();
      const isPro = this.isProPlan();
      const hasKeywords = isPro ? true : this.searchQueries().length >= 3;
      return !!f && !!l && hasKeywords;
    }
    if (step === 4) {
      const isPro = this.isProPlan();
      const channelConnected = isPro ? this.isEmailVerified() : this.isTelegramConnected();
      return !!this.profile()?.receiveMessages && channelConnected;
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
    if (targetStep === 5) return this.isStepValid(1) && this.isStepValid(2) && this.isStepValid(3) && this.isStepValid(4);
    return true;
  }

  async validateStep(step: number): Promise<boolean> {
    if (step === 1) {
      if (!this.selectedPlan()) {
        this.alertify.error('გთხოვთ აირჩიოთ სააბონენტო პაკეტი');
        return false;
      }
      this.step1Confirmed.set(true);
      if (!this.isProPlan() && !this.isTelegramConnected()) {
        this.ensureTelegramLink();
      }
      return true;
    }

    if (step === 2) {
      if (this.cvLoading()) {
        return false;
      }
      if (!this.userCv()) {
        this.alertify.error('გთხოვთ ატვირთოთ CV გასაგრძელებლად');
        return false;
      }
      return true;
    }

    if (step === 3) {
      if (this.keywordLoading()) {
        return false;
      }
      this.infoFormSubmitted.set(true);
      this.infoForm.markAllAsTouched();
      const isPro = this.isProPlan();
      if (!isPro && this.keywordInput().trim()) {
        this.addKeyword();
      }

      const fn = this.infoForm.get('firstName')?.value?.trim();
      const ln = this.infoForm.get('lastName')?.value?.trim();
      if (!fn && !ln) {
        this.alertify.error('გთხოვთ შეავსოთ სახელი და გვარი');
        return false;
      }
      if (!fn) {
        this.alertify.error('გთხოვთ შეიყვანოთ სახელი');
        return false;
      }
      if (!ln) {
        this.alertify.error('გთხოვთ შეიყვანოთ გვარი');
        return false;
      }
      if (this.infoForm.invalid) {
        this.alertify.error('გთხოვთ სწორად შეავსოთ სახელი და გვარი');
        return false;
      }

      if (!isPro) {
        if (this.searchQueries().length === 0) {
          this.alertify.error('საძიებო სიტყვები არ არის მითითებული');
          return false;
        }
        if (this.searchQueries().length < 3) {
          this.alertify.error(`გთხოვთ მიუთითოთ მინიმუმ 3 საძიებო სიტყვა (მითითებულია: ${this.searchQueries().length}/3)`);
          return false;
        }
      }
      this.savePersonalInfo();
      return true;
    }


    if (step === 4) {
      if (this.isNotificationToggling() || this.telegramLoading() || this.emailVerifying() || this.telegramVerifying()) {
        return false;
      }
      this.step4Submitted.set(true);

      const isPro = this.isProPlan();
      if (!isPro && !this.isTelegramConnected()) {
        this.telegramVerifying.set(true);
        try {
          await this.stateStore.loadProfile(true);
        } catch (e) {
          // ignore
        } finally {
          this.telegramVerifying.set(false);
        }
      }

      if (!this.profile()?.receiveMessages) {
        this.alertify.error('შეტყობინებების მიღება არ არის აქტიური');
        return false;
      }

      if (isPro && !this.isEmailVerified()) {
        this.alertify.error('ელ-ფოსტა არ არის დადასტურებული');
        return false;
      }
      if (!isPro && !this.isTelegramConnected()) {
        this.alertify.error('Telegram ბოტი არ არის დაკავშირებული');
        return false;
      }
      return true;
    }

    if (step === 5) {
      if (!this.isStepValid(1)) {
        this.alertify.error('გთხოვთ აირჩიოთ სააბონენტო გეგმა');
        return false;
      }
      if (!this.isStepValid(2)) {
        this.alertify.error('გთხოვთ ატვირთოთ CV');
        return false;
      }
      if (!this.isStepValid(3)) {
        this.alertify.error('გთხოვთ შეავსოთ პირადი ინფორმაცია');
        return false;
      }
      if (!this.isStepValid(4)) {
        this.alertify.error('გთხოვთ ჩართოთ შეტყობინებების არხი');
        return false;
      }
      return true;
    }

    return true;
  }

  async goToStep(step: number) {
    if (step < 1 || step > this.totalSteps || step === this.currentStep()) return;

    // Validate sequential steps before allowing forward navigation
    if (step > this.currentStep()) {
      for (let s = this.currentStep(); s < step; s++) {
        const valid = await this.validateStep(s);
        if (!valid) {
          return;
        }
      }
    }

    this.currentStep.set(step);
    if (step === 4 && !this.isProPlan()) {
      this.ensureTelegramLink();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async nextStep() {
    await this.goToStep(this.currentStep() + 1);
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
      await this.stateStore.getCv(true);

      if (this.currentStep() === 2) {
        this.goToStep(3);
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
      this.isNotificationToggling.set(true);
      try {
        this.stateStore.updateProfile(this.profile().id, { receiveMessages: checked });
      } catch (e) {
        console.error('Failed to sync receiveMessages:', e);
      } finally {
        this.isNotificationToggling.set(false);
      }
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
        window.location.href = link;
      } else {
        const dialogRef = this.dialog.open(QrModal, {
          width: '400px',
          disableClose: true,
          autoFocus: false,
          data: { telegramLink: link },
        });

        dialogRef.afterClosed().subscribe((result) => {
          if (result) {
            this.alertify.success('Telegram წარმატებით დაკავშირდა');
          }
        });
      }
    } catch (err) {
      console.error('Error generating telegram token:', err);
      this.alertify.error('Telegram-ის ტოკენის გენერაცია ვერ მოხერხდა');
    } finally {
      this.telegramLoading.set(false);
    }
  }

  async verifyTelegramConnection() {
    if (this.telegramVerifying()) return;
    this.telegramVerifying.set(true);
    try {
      await this.stateStore.loadProfile(true);
      if (this.isTelegramConnected()) {
        this.alertify.success('Telegram წარმატებით დადასტურდა! 🎉');
      } else {
        this.alertify.warning('Telegram ბოტი ჯერ არ არის დაკავშირებული. გთხოვთ გახსნათ ბოტი Telegram-ში, დააჭიროთ Start-ს და შემდეგ სცადოთ ხელახლა.');
      }
    } catch (err) {
      this.alertify.error('შემოწმებისას დაფიქსირდა შეცდომა');
    } finally {
      this.telegramVerifying.set(false);
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
        this.stateStore.updateProfile(this.profile().id, { isEmailVerified: true });
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
        await this.stateStore.assignSubscriptionPlan(plan as any);
      } else {
        this.stateStore.updateLocalProfile({ subscription: plan });
        await this.stateStore.loadProfile(true);
      }

      this.isCompleted.set(true);
      this.alertify.success('გილოცავთ! თქვენი პროფილი მზად არის');
    } catch (err) {
      console.error('Error completing onboarding:', err);
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
      this.router.navigate(['/private/profile']);
    }
  }

  async navigateToDashboard() {
    if (this.dialogRef) {
      this.dialogRef.close(true);
      return;
    }

    try {
      await this.stateStore.loadProfile(true);
    } catch (e) {
      console.error('Error refreshing profile upon onboarding completion:', e);
    }

    const isPro = this.stateStore.isPro();
    const targetUrl = isPro ? '/private/dashboard' : '/private/profile';
    await this.router.navigate([targetUrl], { replaceUrl: true });
  }
}

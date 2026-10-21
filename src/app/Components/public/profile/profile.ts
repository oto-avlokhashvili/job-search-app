import { Component, effect, inject, signal, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs';
import { FormBuilder, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { StateStore } from '../../../Store/state.store';
import { AuthService } from '../../../Core/Services/auth-service';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionModal } from '../subscription-modal/subscription-modal';
import { NotificationChannel, openNotificationChannelsModal } from '../notification-channels-modal/notification-channels-modal';
import { generateJobSlug } from '../../../Core/Utils/slug-generator';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
  host: { class: 'account-page' },
})
export class Profile {
  validators = signal(false);
  fb = inject(FormBuilder);
  stateStore = inject(StateStore);
  authService = inject(AuthService);
  private alertify = inject(AlertifyService);
  dialog = inject(MatDialog);
  private router = inject(Router);
  keywordInputValue = signal<string>('');

  // Sent jobs ("შეტყობინებების ისტორია" accordion; this used to be the /notifications page)
  sentJobsPage = signal<number>(1);
  sentJobsLimit = 10;

  openAccordions = signal<Record<string, boolean>>({
    info: false,
    keywords: true,
    channels: false,
    notifications: false,
    cv: false,
    subscription: false,
  });

  toggleAccordion(section: string) {
    this.openAccordions.update((state) => ({
      ...state,
      [section]: !state[section],
    }));
    if (section === 'notifications' && this.isAccordionOpen('notifications')) {
      this.loadSentJobs();
    }
  }

  isAccordionOpen(section: string): boolean {
    return !!this.openAccordions()[section];
  }

  initials = computed(() => {
    const u = this.stateStore.profile();
    if (!u) return '';
    return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
  });

  isWordFile = computed(() => {
    const name = this.stateStore.userCv()?.originalName || '';
    return name.toLowerCase().endsWith('.doc') || name.toLowerCase().endsWith('.docx');
  });

  // Phones show only the salary estimate of the CV analysis; "მეტის ნახვა" reveals the rest.
  isMobile = toSignal(
    inject(BreakpointObserver).observe('(max-width: 768px)').pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  cvDetailsExpanded = signal(false);
  showAllCvDetails = computed(() => !this.isMobile() || this.cvDetailsExpanded());

  cvTextSummary = computed(() => {
    const cv = this.stateStore.userCv();
    if (!cv) return '';
    if (typeof cv.summary === 'string') return cv.summary;
    const s = cv.summary;
    if (s && typeof s === 'object') {
      return (
        s.summary ||
        s.overview ||
        s.candidateSummary ||
        s.description ||
        s.text ||
        s.candidateProfile?.summary ||
        ''
      );
    }
    return cv.cvSummary || cv.overview || cv.description || '';
  });

  profileForm = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: [{ value: '', disabled: true }],
    subscription: [''],
    searchQuery: [[] as string[]],
    telegramChatId: [''],
    receiveMessages: [false],
  });

  constructor() {
    // No-op when already loaded; needed after the Google login redirect, which signs in on this page.
    this.stateStore.ensureDataLoaded();

    effect(() => {
      const profile = this.stateStore.profile();
      const loaded = this.stateStore.profileLoaded();

      if (loaded && profile) {
        this.profileForm.patchValue({
          firstName: profile.firstName || '',

          lastName: profile.lastName || '',
          email: profile.email || '',
          subscription: profile.subscription || '',
          telegramChatId: profile.telegramChatId || '',
          searchQuery: profile.searchQuery || [],
          receiveMessages: profile.receiveMessages ?? false,
        });
      }
    });
  }

  isInvalid(name: string) {
    const control = this.profileForm.get(name);
    return !!(control && control.invalid && (control.touched || this.validators()));
  }

  popularKeywords = signal<string[]>([
    'Frontend Developer',
    'Backend Developer',
    'Full Stack',
    'Angular',
    'React',
    'Node.js',
    'Python',
    'UI/UX Designer',
    'DevOps',
  ]);

  keywordsLoading = signal<boolean>(false);
  addingKeyword = signal<string | null>(null);
  removingKeywordIndex = signal<number | null>(null);

  async addSuggestedKeyword(keyword: string) {
    if (this.keywordsLoading()) return;
    const currentKeywords = this.stateStore.searchQuery() || [];
    if (!currentKeywords.includes(keyword)) {
      this.addingKeyword.set(keyword);
      this.keywordsLoading.set(true);
      try {
        await this.stateStore.updateSearchQueries([...currentKeywords, keyword]);
        this.alertify.success(`დაემატა: ${keyword}`);
      } catch (err) {
        this.alertify.error('საკვანძო სიტყვის დამატება ვერ მოხერხდა');
      } finally {
        this.addingKeyword.set(null);
        this.keywordsLoading.set(false);
      }
    }
  }

  async addKeywordFromValue() {
    if (this.keywordsLoading()) return;
    const value = this.keywordInputValue().trim();
    if (value) {
      const currentKeywords = this.stateStore.searchQuery() || [];
      if (!currentKeywords.includes(value)) {
        this.addingKeyword.set(value);
        this.keywordsLoading.set(true);
        try {
          await this.stateStore.updateSearchQueries([...currentKeywords, value]);
          this.keywordInputValue.set('');
        } catch (err) {
          this.alertify.error('საკვანძო სიტყვის დამატება ვერ მოხერხდა');
        } finally {
          this.addingKeyword.set(null);
          this.keywordsLoading.set(false);
        }
      } else {
        this.keywordInputValue.set('');
      }
    }
  }

  async removeKeyword(index: number) {
    if (this.keywordsLoading()) return;
    const currentKeywords = this.stateStore.searchQuery() || [];
    const updatedKeywords = currentKeywords.filter((_, i) => i !== index);
    this.removingKeywordIndex.set(index);
    this.keywordsLoading.set(true);
    try {
      await this.stateStore.updateSearchQueries(updatedKeywords);
    } catch (err) {
      this.alertify.error('საკვანძო სიტყვის წაშლა ვერ მოხერხდა');
    } finally {
      this.removingKeywordIndex.set(null);
      this.keywordsLoading.set(false);
    }
  }

  save() {
    this.validators.set(true);
    if (this.profileForm.valid) {
      const val = this.profileForm.getRawValue();
      const payload = {
        firstName: val.firstName,
        lastName: val.lastName,
        receiveMessages: val.receiveMessages,
      };
      this.stateStore.updateProfile(this.stateStore.profile()?.id, payload);
      this.alertify.success('პროფილის მონაცემები წარმატებით განახლდა');
    } else {
      this.alertify.error('გთხოვთ შეავსოთ სავალდებულო ველები');
    }
  }

  toggleReceiveMessages(event: any) {
    const checked = event.target.checked;
    if (checked && !this.stateStore.alertsReady()) {
      // Missing CV or channel: walk through the setup, which turns alerts on when it's done.
      event.target.checked = false;
      this.openChannels();
      return;
    }
    this.profileForm.patchValue({ receiveMessages: checked });
    this.stateStore.updateProfile(this.stateStore.profile()?.id, { receiveMessages: checked });
    this.alertify.success(checked ? 'შეტყობინებების მიღება გააქტიურდა' : 'შეტყობინებების მიღება გამორთულია');
  }

  openUpgradeModal() {
    this.dialog.open(SubscriptionModal, {
      width: '960px',
      maxWidth: '96vw',
      panelClass: 'subscription-dialog',
      disableClose: false,
      autoFocus: false,
    });
  }

  openChannels(channel?: NotificationChannel) {
    openNotificationChannelsModal(this.dialog, channel);
  }

  loadSentJobs() {
    this.stateStore.loadSentJobs(this.sentJobsPage(), this.sentJobsLimit, false);
  }

  onSentJobsPageChange(page: number) {
    const lastPage = this.stateStore.sentJobs().lastPage;
    if (page < 1 || (lastPage && page > lastPage)) return;
    this.sentJobsPage.set(page);
    this.loadSentJobs();
    document.getElementById('section-notifications')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  openVacancyDetails(item: any) {
    const jobId = item?.jobId || item?.id;
    if (!jobId) return;
    this.router.navigate(['/vacancies', generateJobSlug(item.vacancy || item.title, item.company, jobId)]);
  }

  deleteCv() {
    this.stateStore.deleteCv();
  }

  isDragOver = signal<boolean>(false);
  maxFileSizeMB = 10;
  allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  cvConsent = signal<boolean>(false);
  cvConsentError = signal<boolean>(false);

  toggleCvConsent(event: any) {
    const checked = !!event.target?.checked;
    this.cvConsent.set(checked);
    if (checked) {
      this.cvConsentError.set(false);
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
    if (!this.cvConsent()) {
      this.cvConsentError.set(true);
      this.alertify.warning('CV-ს ასატვირთად გთხოვთ ჯერ მონიშნოთ თანხმობა პერსონალური მონაცემების დამუშავებაზე');
      return;
    }
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.processFile(files[0]);
    }
  }

  onUploadBtnClick(fileInput: HTMLInputElement) {
    if (!this.cvConsent()) {
      this.cvConsentError.set(true);
      this.alertify.warning('CV-ს ასატვირთად გთხოვთ ჯერ მონიშნოთ თანხმობა პერსონალური მონაცემების დამუშავებაზე');
      return;
    }
    fileInput.click();
  }

  processFile(file: File) {
    if (!this.allowedTypes.includes(file.type)) {
      this.alertify.error('გთხოვთ ატვირთოთ PDF ან Word (DOC/DOCX) ფორმატი');
      return;
    }
    if (file.size > this.maxFileSizeMB * 1024 * 1024) {
      this.alertify.error('ფაილის ზომა არ უნდა აღემატებოდეს 10MB-ს');
      return;
    }
    if (!this.cvConsent()) {
      this.cvConsentError.set(true);
      this.alertify.warning('CV-ს ასატვირთად გთხოვთ ჯერ მონიშნოთ თანხმობა პერსონალური მონაცემების დამუშავებაზე');
      return;
    }
    this.cvConsentError.set(false);
    this.stateStore.uploadCv(file, this.cvConsent());
  }

  uploadCv(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    this.processFile(file);
    event.target.value = '';
  }
}

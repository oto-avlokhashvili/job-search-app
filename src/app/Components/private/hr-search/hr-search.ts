import { afterNextRender, Component, computed, DestroyRef, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HrService } from '../../../Core/Services/hr';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { HrCandidate, SeniorityLevel } from '../../../Core/Interfaces/hr';
import { HrStore, HrSearchTab } from '../../../Store/hr.store';
import { HrCandidateCard } from '../hr-candidate-card/hr-candidate-card';

interface SeniorityOption {
  value: SeniorityLevel | '';
  label: string;
  hint: string;
  icon: string;
}

// One form, two sources: our CV base (ranked, anonymized until unlocked) and LinkedIn via Google.
// Query, tab and results live in HrStore, so coming back to the page shows them again.
@Component({
  selector: 'app-hr-search',
  imports: [ReactiveFormsModule, RouterLink, HrCandidateCard],
  templateUrl: './hr-search.html',
  styleUrl: './hr-search.scss',
})
export class HrSearch {
  private fb = inject(FormBuilder);
  private alertify = inject(AlertifyService);
  private hrService = inject(HrService);
  private hrStore = inject(HrStore);

  seniorityOptions: SeniorityOption[] = [
    { value: '', label: 'ნებისმიერი', hint: 'ყველა დონე', icon: 'groups' },
    { value: 'Junior', label: 'Junior', hint: '0–2 წელი', icon: 'signal_cellular_1_bar' },
    { value: 'Mid', label: 'Mid', hint: '2–5 წელი', icon: 'signal_cellular_2_bar' },
    { value: 'Senior', label: 'Senior', hint: '5+ წელი', icon: 'signal_cellular_3_bar' },
    { value: 'Lead', label: 'Lead', hint: 'გუნდის ლიდერი', icon: 'signal_cellular_4_bar' },
    { value: 'Principal', label: 'Principal', hint: 'ექსპერტი / არქიტექტორი', icon: 'workspace_premium' },
  ];
  form = this.fb.nonNullable.group({
    keyword: [this.hrStore.searchForm().keyword, [Validators.required, Validators.maxLength(200)]],
    location: [this.hrStore.searchForm().location, Validators.maxLength(100)],
    seniority: [this.hrStore.searchForm().seniority],
  });

  // One-tap searches under the form.
  popularSearches = ['Accountant', 'Sales Manager', 'Developer', 'Marketing', 'Customer Support', 'Designer'];
  // Placeholder cards while the first page of CVs loads.
  skeletons = [1, 2, 3, 4];

  // Popular searches scroll sideways; arrows appear only when there is more in that direction.
  private quickTrack = viewChild<ElementRef<HTMLElement>>('quickTrack');
  canScrollLeft = signal(false);
  canScrollRight = signal(false);

  // Custom experience dropdown (the native <select> can't be styled to match).
  seniorityOpen = signal(false);
  private seniorityValue = toSignal(this.form.controls.seniority.valueChanges, {
    initialValue: this.form.controls.seniority.value,
  });
  selectedSeniority = computed(
    () => this.seniorityOptions.find((o) => o.value === this.seniorityValue()) ?? this.seniorityOptions[0],
  );

  tab = this.hrStore.searchTab;
  query = this.hrStore.searchQuery;
  // Set by "search for this vacancy" on a vacancy board; listed first in the add menu
  targetVacancy = computed(() => {
    const id = this.hrStore.searchVacancyId();
    return this.hrStore.vacancies().find((v) => v.id === id && v.status === 'OPEN') ?? null;
  });

  cvs = this.hrStore.cvs;
  cvTotal = this.hrStore.cvTotal;
  cvPage = this.hrStore.cvPage;
  cvLoading = this.hrStore.cvLoading;
  cvSearched = this.hrStore.cvSearched;
  cvError = this.hrStore.cvError;
  busyId = signal<number | null>(null);

  profiles = this.hrStore.profiles;
  linkedinPage = this.hrStore.linkedinPage;
  linkedinHasMore = this.hrStore.linkedinHasMore;
  linkedinLoading = this.hrStore.linkedinLoading;
  linkedinSearched = this.hrStore.linkedinSearched;
  linkedinError = this.hrStore.linkedinError;

  constructor() {
    // Keep what was typed (even if not searched yet) for the next visit.
    inject(DestroyRef).onDestroy(() => this.hrStore.saveSearchForm(this.form.getRawValue()));
    afterNextRender(() => this.updateQuickArrows());
  }

  @HostListener('window:resize')
  updateQuickArrows() {
    const el = this.quickTrack()?.nativeElement;
    if (!el) return;
    this.canScrollLeft.set(el.scrollLeft > 2);
    this.canScrollRight.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }

  scrollQuick(direction: 1 | -1) {
    const el = this.quickTrack()?.nativeElement;
    el?.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: 'smooth' });
  }

  toggleSeniority() {
    this.seniorityOpen.update((open) => !open);
  }

  chooseSeniority(value: SeniorityLevel | '') {
    this.form.controls.seniority.setValue(value);
    this.seniorityOpen.set(false);
  }

  // Close the dropdown on a click outside it or on Escape.
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.seniorityOpen() && !(event.target as HTMLElement).closest('.select')) this.seniorityOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.seniorityOpen.set(false);
  }

  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { keyword, location, seniority } = this.form.getRawValue();
    this.hrStore.search({ keyword: keyword.trim(), location: location.trim(), seniority });
  }

  quickSearch(term: string) {
    this.form.controls.keyword.setValue(term);
    this.submit();
  }

  selectTab(tab: HrSearchTab) {
    this.hrStore.selectTab(tab);
  }

  searchCvs(page: number) {
    this.hrStore.searchCvs(page);
  }

  searchLinkedin(page: number) {
    this.hrStore.searchLinkedin(page);
  }

  async unlock(candidate: HrCandidate) {
    this.busyId.set(candidate.id);
    try {
      await this.hrStore.unlock(candidate);
    } catch (err) {
      this.alertify.error(this.hrService.errorMessage(err, 'კონტაქტის გახსნა ვერ მოხერხდა'));
    } finally {
      this.busyId.set(null);
    }
  }

  async addToVacancy(candidate: HrCandidate, vacancyId: number) {
    this.busyId.set(candidate.id);
    try {
      await this.hrStore.addToVacancy(candidate, vacancyId);
      const title = this.hrStore.vacancies().find((v) => v.id === vacancyId)?.title;
      this.alertify.success(title ? `კანდიდატი დაემატა: ${title}` : 'კანდიდატი დაემატა');
    } catch (err) {
      this.alertify.error(this.hrService.errorMessage(err, 'ვაკანსიაში დამატება ვერ მოხერხდა'));
    } finally {
      this.busyId.set(null);
    }
  }

  clearTargetVacancy() {
    this.hrStore.setSearchVacancy(null);
  }

  async download(candidate: HrCandidate) {
    this.busyId.set(candidate.id);
    try {
      await this.hrService.downloadCv(candidate.id, `${candidate.contact?.fullName || 'cv'}`);
    } catch {
      this.alertify.error('CV-ის ჩამოტვირთვა ვერ მოხერხდა');
    } finally {
      this.busyId.set(null);
    }
  }
}

import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { RouterLink } from '@angular/router';
import { HrService } from '../../../Core/Services/hr';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { NgTemplateOutlet } from '@angular/common';
import { ExperienceFilter, HrAiResult, HrCandidate, LinkedinProfile } from '../../../Core/Interfaces/hr';
import { HrStore, HrSearchTab } from '../../../Store/hr.store';
import { HrCandidateCard } from '../hr-candidate-card/hr-candidate-card';
import { HrInterviewDialog } from '../hr-interview-dialog/hr-interview-dialog';
import { GEORGIAN_UNIVERSITIES, LANGUAGES } from '../../../Core/Constants/georgian-universities';

interface SeniorityOption {
  value: ExperienceFilter | '';
  label: string;
  hint: string;
  icon: string;
}

type FilterKey = 'location' | 'company' | 'university' | 'skills' | 'languages' | 'seniority' | 'openToWork';

interface FilterOption {
  value: string;
  hint?: string;
  /** Georgian name, shown under the value and searchable */
  ka?: string;
  /** Abbreviations / nicknames (English and Georgian), searchable */
  abbr?: string[];
}

/** Most values one list filter takes (the API reads five) */
const MULTI_MAX = 5;
const splitValues = (value: string) => value.split(',').map((v) => v.trim()).filter(Boolean);

/**
 * One pill in the filter bar. A new filter = a form control of the same key, an entry in
 * `filters`, and the store/API passing it on. `tabs` lists the sources whose backend applies it;
 * on the others the pill is hidden (its value is kept).
 */
interface FilterDef {
  key: FilterKey;
  label: string;
  icon: string;
  /** text: one value; multi: several, from `options` and/or typed; select: one of a list; toggle: on/off */
  kind: 'text' | 'multi' | 'select' | 'toggle';
  tabs: HrSearchTab[];
  hint?: string;
  placeholder?: string;
  suggestions?: string[];
  /** multi: the searchable list (without it, values are only typed) */
  options?: FilterOption[];
}

const ALL_TABS: HrSearchTab[] = ['cvs', 'ai', 'linkedin'];

// One form, three tabs: our CV base (ranked, anonymized until unlocked), AI selection (our CVs and
// LinkedIn ranked together by the AI) and LinkedIn via Google.
// Query, tab and results live in HrStore, so coming back to the page shows them again.
@Component({
  selector: 'app-hr-search',
  imports: [ReactiveFormsModule, RouterLink, NgTemplateOutlet, HrCandidateCard, HrInterviewDialog],
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
    { value: 'Entry', label: 'გამოცდილების გარეშე', hint: 'სტუდენტი, კურსდამთავრებული, სტაჟიორი', icon: 'school' },
    { value: 'Junior', label: 'Junior', hint: '0–2 წელი', icon: 'signal_cellular_1_bar' },
    { value: 'Mid', label: 'Mid', hint: '2–5 წელი', icon: 'signal_cellular_2_bar' },
    { value: 'Senior', label: 'Senior', hint: '5+ წელი', icon: 'signal_cellular_3_bar' },
    { value: 'Lead', label: 'Lead', hint: 'გუნდის ლიდერი', icon: 'signal_cellular_4_bar' },
    { value: 'Principal', label: 'Principal', hint: 'ექსპერტი / არქიტექტორი', icon: 'workspace_premium' },
  ];
  form = this.fb.nonNullable.group({
    // 400 for the AI tab's description; the keyword tabs' input stops at 200
    keyword: [this.hrStore.searchForm().keyword, [Validators.required, Validators.maxLength(400)]],
    location: [this.hrStore.searchForm().location, Validators.maxLength(100)],
    company: [this.hrStore.searchForm().company ?? '', Validators.maxLength(300)],
    university: [this.hrStore.searchForm().university ?? '', Validators.maxLength(300)],
    skills: [this.hrStore.searchForm().skills ?? '', Validators.maxLength(300)],
    languages: [this.hrStore.searchForm().languages ?? '', Validators.maxLength(300)],
    seniority: [this.hrStore.searchForm().seniority],
    openToWork: [this.hrStore.searchForm().openToWork ?? false],
  });

  filters: FilterDef[] = [
    {
      key: 'location',
      label: 'ლოკაცია',
      icon: 'location_on',
      kind: 'text',
      tabs: ALL_TABS,
      hint: 'ქალაქი, სადაც კანდიდატი ცხოვრობს ან მუშაობს',
      placeholder: 'მაგ: Tbilisi',
      suggestions: ['Tbilisi', 'Batumi', 'Kutaisi', 'Rustavi'],
    },
    {
      key: 'skills',
      label: 'უნარები',
      icon: 'construction',
      kind: 'multi',
      tabs: ALL_TABS,
      hint: 'კანდიდატს ყველა არჩეული უნარი უნდა ჰქონდეს',
      placeholder: 'ჩაწერეთ უნარი და დააჭირეთ Enter-ს',
    },
    {
      key: 'languages',
      label: 'ენები',
      icon: 'translate',
      kind: 'multi',
      tabs: ALL_TABS,
      hint: 'კანდიდატი ყველა არჩეულ ენას უნდა ფლობდეს',
      placeholder: 'მოძებნეთ ენა',
      options: LANGUAGES,
    },
    {
      key: 'university',
      label: 'უნივერსიტეტი',
      icon: 'school',
      kind: 'multi',
      tabs: ALL_TABS,
      hint: 'სადაც კანდიდატი სწავლობდა. რამდენიმე არჩეულიდან ერთ-ერთი',
      placeholder: 'მოძებნეთ უნივერსიტეტი',
      options: GEORGIAN_UNIVERSITIES,
    },
    {
      key: 'company',
      label: 'კომპანია',
      icon: 'apartment',
      kind: 'multi',
      // Not for the CV base: HRs search it by role and skills
      tabs: ['ai', 'linkedin'],
      hint: 'სადაც კანდიდატი მუშაობს ან უმუშავია. რამდენიმე არჩეულიდან ერთ-ერთი',
      placeholder: 'ჩაწერეთ კომპანია და დააჭირეთ Enter-ს',
    },
    { key: 'seniority', label: 'გამოცდილება', icon: 'signal_cellular_alt', kind: 'select', tabs: ['cvs', 'ai'] },
    {
      key: 'openToWork',
      label: 'Open to work',
      icon: 'work_history',
      kind: 'toggle',
      tabs: ['ai', 'linkedin'],
      hint: 'მხოლოდ LinkedIn პროფილები, სადაც წერია Open to work',
    },
  ];

  // One-tap searches under the form.
  popularSearches = ['Accountant', 'Sales Manager', 'Developer', 'Marketing', 'Customer Support', 'Designer'];
  // Placeholder cards while the first page of CVs loads.
  skeletons = [1, 2, 3, 4];

  // Popular searches scroll sideways; arrows appear only when there is more in that direction.
  private quickTrack = viewChild<ElementRef<HTMLElement>>('quickTrack');
  canScrollLeft = signal(false);
  canScrollRight = signal(false);

  tab = this.hrStore.searchTab;

  // The whole form as a signal, so pills and counts follow every change
  formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  visibleFilters = computed(() => this.filters.filter((f) => f.tabs.includes(this.tab())));
  activeCount = computed(() => this.visibleFilters().filter((f) => this.isActive(f)).length);
  // The open filter panel, and what is typed in it until "apply"
  openFilter = signal<FilterKey | null>(null);
  draft = signal('');
  // A list filter's panel: the values picked so far, and the search box
  draftList = signal<string[]>([]);
  search = signal('');
  private openDef = computed(() => this.filters.find((f) => f.key === this.openFilter()) ?? null);
  filteredOptions = computed(() => {
    const options = this.openDef()?.options ?? [];
    const q = this.search().trim().toLowerCase();
    if (!q) return options;
    // Matches on the English or Georgian name, an abbreviation (TSU / თსუ) or the hint.
    // An exact abbreviation goes first, so "TSU" shows TSU before names that merely contain it.
    const exact: FilterOption[] = [];
    const partial: FilterOption[] = [];
    for (const o of options) {
      const abbrs = o.abbr?.map((a) => a.toLowerCase()) ?? [];
      if (abbrs.includes(q)) {
        exact.push(o);
      } else if (
        o.value.toLowerCase().includes(q) ||
        o.ka?.toLowerCase().includes(q) ||
        abbrs.some((a) => a.includes(q)) ||
        o.hint?.toLowerCase().includes(q)
      ) {
        partial.push(o);
      }
    }
    return [...exact, ...partial];
  });
  // The search text as a new value, unless the list has it or it's picked already
  customCandidate = computed(() => {
    const q = this.search().trim();
    if (!q || !this.openDef()) return null;
    const lower = q.toLowerCase();
    const known = this.openDef()!.options?.some(
      (o) => o.value.toLowerCase() === lower || o.ka?.toLowerCase() === lower || o.abbr?.some((a) => a.toLowerCase() === lower),
    );
    const picked = this.draftList().some((v) => v.toLowerCase() === lower);
    return known || picked ? null : q;
  });
  multiFull = computed(() => this.draftList().length >= MULTI_MAX);
  private panelInput = viewChild<ElementRef<HTMLInputElement>>('panelInput');
  private aiQuery = viewChild<ElementRef<HTMLTextAreaElement>>('aiQuery');

  sourceHint = computed(() => {
    switch (this.tab()) {
      case 'ai':
        return 'აღწერეთ კანდიდატი თავისუფალი ტექსტით: AI ეძებს CV ბაზაში და LinkedIn-ზე';
      case 'linkedin':
        return 'საჯარო LinkedIn პროფილები. რამდენიმე პოზიცია გამოყავით მძიმით';
      default:
        return 'ანონიმური CV-ები Job Up-ის ბაზიდან. რამდენიმე უნარი გამოყავით მძიმით';
    }
  });
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

  aiResults = this.hrStore.aiResults;
  aiTotal = this.hrStore.aiTotal;
  aiPage = this.hrStore.aiPage;
  aiLoading = this.hrStore.aiLoading;
  aiSearched = this.hrStore.aiSearched;
  aiError = this.hrStore.aiError;
  aiKeywords = this.hrStore.aiKeywords;
  aiRanked = this.hrStore.aiRanked;
  aiLinkedin = this.hrStore.aiLinkedin;
  aiShown = computed(() => {
    const results = this.aiResults();
    const cv = results.filter((r) => r.source === 'cv').length;
    return { cv, linkedin: results.length - cv };
  });
  // The AI tab takes a sentence, the others keywords
  keywordPlaceholder = computed(() =>
    this.tab() === 'ai'
      ? 'აღწერე როგორ კანდიდატს ეძებ'
      : this.tab() === 'cvs'
        ? 'პოზიცია ან უნარები (არასავალდებულო: შეგიძლიათ მხოლოდ ფილტრებით)'
        : 'მაგ: Accountant, Excel',
  );

  profiles = this.hrStore.profiles;
  linkedinPage = this.hrStore.linkedinPage;
  linkedinHasMore = this.hrStore.linkedinHasMore;
  linkedinLoading = this.hrStore.linkedinLoading;
  linkedinSearched = this.hrStore.linkedinSearched;
  linkedinError = this.hrStore.linkedinError;
  // A LinkedIn profile's "book a meeting": an invitation link for the HR to send them (they join with their CV)
  inviting = signal<{ vacancyId: number | null; inviteeName: string; position?: string } | null>(null);

  constructor() {
    // Keep what was typed (even if not searched yet) for the next visit.
    inject(DestroyRef).onDestroy(() => this.hrStore.saveSearchForm(this.form.getRawValue()));
    afterNextRender(() => this.updateQuickArrows());
    // A text filter's panel opens ready to type
    effect(() => this.panelInput()?.nativeElement.focus());
    // The CV base can be searched by filters alone; the AI and LinkedIn need the text
    effect(() => {
      const keyword = this.form.controls.keyword;
      if (this.tab() === 'cvs') keyword.removeValidators(Validators.required);
      else keyword.addValidators(Validators.required);
      keyword.updateValueAndValidity({ emitEvent: false });
    });
    // The AI textarea fits its text when it appears (switching tabs, coming back to the page)
    effect(() => {
      if (this.aiQuery()) queueMicrotask(() => this.autoGrow());
    });
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

  // ─── Filters ───────────────────────────────────────────────
  private control(key: FilterKey) {
    return this.form.controls[key] as FormControl<string | boolean>;
  }

  isActive(f: FilterDef): boolean {
    const value = this.formValue()[f.key];
    return f.kind === 'toggle' ? value === true : typeof value === 'string' && value.trim() !== '';
  }

  displayValue(f: FilterDef): string {
    const value = this.formValue()[f.key];
    if (f.kind === 'select') return this.seniorityOptions.find((o) => o.value === value)?.label ?? '';
    if (f.kind === 'multi' && typeof value === 'string') {
      const values = splitValues(value);
      return values.length > 1 ? `${values[0]} +${values.length - 1}` : (values[0] ?? '');
    }
    return typeof value === 'string' ? value.trim() : '';
  }

  pillIcon(f: FilterDef): string {
    if (f.key === 'seniority' && this.isActive(f)) {
      return this.seniorityOptions.find((o) => o.value === this.formValue().seniority)?.icon ?? f.icon;
    }
    return f.icon;
  }

  togglePanel(f: FilterDef) {
    if (this.openFilter() === f.key) return this.closePanel();
    const value = this.formValue()[f.key];
    this.draft.set(typeof value === 'string' ? value : '');
    this.draftList.set(typeof value === 'string' ? splitValues(value) : []);
    this.search.set('');
    this.openFilter.set(f.key);
  }

  closePanel() {
    this.openFilter.set(null);
  }

  applyText(f: FilterDef) {
    this.setFilter(f, this.draft().trim());
  }

  pickSuggestion(f: FilterDef, value: string) {
    this.draft.set(value);
    this.applyText(f);
  }

  isPicked(value: string): boolean {
    return this.draftList().includes(value);
  }

  toggleOption(value: string) {
    if (this.isPicked(value)) this.draftList.update((list) => list.filter((v) => v !== value));
    else if (!this.multiFull()) this.draftList.update((list) => [...list, value]);
  }

  /** Enter in a list filter's search: the typed value, or the only match in the list */
  addSearch() {
    const custom = this.customCandidate();
    const matches = this.filteredOptions();
    if (custom && !matches.length) this.toggleOption(custom);
    else if (matches.length === 1) this.toggleOption(matches[0].value);
    else if (custom && !this.openDef()?.options) this.toggleOption(custom);
    else return;
    this.search.set('');
  }

  addCustom() {
    const custom = this.customCandidate();
    if (custom) this.toggleOption(custom);
    this.search.set('');
  }

  applyMulti(f: FilterDef) {
    this.setFilter(f, this.draftList().join(', '));
  }

  chooseOption(f: FilterDef, value: ExperienceFilter | '') {
    this.setFilter(f, value);
  }

  toggleFilter(f: FilterDef) {
    this.setFilter(f, !this.isActive(f));
  }

  clearFilter(f: FilterDef) {
    this.setFilter(f, f.kind === 'toggle' ? false : '');
  }

  clearAll() {
    for (const f of this.visibleFilters()) this.control(f.key).setValue(f.kind === 'toggle' ? false : '');
    this.closePanel();
    this.rerun();
  }

  clearKeyword() {
    this.form.controls.keyword.setValue('');
    this.autoGrow();
  }

  /** Grows the AI textarea with its text, up to the CSS max-height */
  autoGrow() {
    const el = this.aiQuery()?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  onAiEnter(event: Event) {
    const e = event as KeyboardEvent;
    if (e.shiftKey || e.isComposing) return;
    e.preventDefault();
    this.submit();
  }

  /** A changed filter applies at once when there are results to refine; otherwise on the next search. */
  private setFilter(f: FilterDef, value: string | boolean) {
    const changed = this.control(f.key).value !== value;
    this.control(f.key).setValue(value);
    this.closePanel();
    if (changed) this.rerun();
  }

  private rerun() {
    if (this.query() && this.form.controls.keyword.valid) this.submit();
  }

  // Close the open panel on a click outside its pill, or on Escape.
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.openFilter() && !(event.target as HTMLElement).closest('.pill-group')) this.closePanel();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closePanel();
  }

  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    if (this.tab() === 'cvs' && !this.form.controls.keyword.value.trim() && !this.activeCount()) {
      this.alertify.error('შეიყვანეთ პოზიცია ან უნარები, ან აირჩიეთ ფილტრი');
      return;
    }
    const v = this.form.getRawValue();
    this.hrStore.search({
      keyword: v.keyword.trim(),
      location: v.location.trim(),
      seniority: v.seniority,
      company: v.company.trim(),
      university: v.university.trim(),
      skills: v.skills.trim(),
      languages: v.languages.trim(),
      openToWork: v.openToWork,
    });
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

  searchCvsWithAi(page: number) {
    this.hrStore.searchCvsWithAi(page);
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

  /** For the vacancy being searched for if there is one, else the search itself as the position */
  aiTrack(result: HrAiResult): string {
    return result.source === 'cv' ? `cv:${result.id}` : result.profile.url;
  }

  bookMeeting(profile: LinkedinProfile) {
    const vacancy = this.targetVacancy();
    this.inviting.set({
      vacancyId: vacancy?.id ?? null,
      inviteeName: profile.name,
      position: vacancy ? undefined : this.query()?.keyword,
    });
  }

  onInvited() {
    this.inviting.set(null);
    this.alertify.success('ბმული შეიქმნა: კანდიდატი დაფაზე CV-ის ატვირთვისას გამოჩნდება');
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

import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Meta } from '@angular/platform-browser';
import { HrService } from '../../../Core/Services/hr';
import { InterviewAnswer as Answer, PublicInterview } from '../../../Core/Interfaces/hr';
import { dateParts, formatDay, formatShort, formatTime, MAX_ALTERNATIVES, relativeDay } from '../../../Core/Utils/interview';
import { DateTimePicker } from '../../shared/date-time-picker/date-time-picker';

type Action = Answer['action'];
/** What the page shows: the invitation with its three answers, one answer's step, or the answer given */
type View = 'choose' | 'step' | 'result' | 'closed';

const DECLINE_REASONS = ['სხვა შეთავაზება მივიღე', 'დრო არ მიწყობს', 'პოზიცია აღარ მაინტერესებს'];
// Google Calendar's template link wants UTC like 20261030T070000Z
const calendarStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Where the buttons of an interview email lead (and an HR's invitation link). The email button only
 * picks the answer; it's sent from here with one more tap, so link scanners opening the email can't
 * answer for the candidate. Without alternatives or details to give, "confirm" is that one tap.
 */
@Component({
  selector: 'app-interview-answer',
  imports: [DateTimePicker, NgTemplateOutlet],
  templateUrl: './interview-answer.html',
  styleUrl: './interview-answer.scss',
})
export class InterviewAnswer implements OnInit {
  private route = inject(ActivatedRoute);
  private hrService = inject(HrService);

  token = this.route.snapshot.paramMap.get('token') ?? '';
  interview = signal<PublicInterview | null>(null);
  loading = signal(true);
  loadError = signal('');

  action = signal<Action | null>(null);
  // confirm: -1 = the main time, otherwise one of the offered alternatives
  slot = signal(-1);
  note = signal('');
  // Times the candidate suggests (ISO); the one being edited shows the picker
  proposals = signal<string[]>([]);
  editingProposal = signal<number | null>(null);
  sending = signal(false);
  sendError = signal('');
  // "Change my answer" pressed: the three answers again, though one was given
  changing = signal(false);

  // New candidate (invited, not on the platform): their details and CV come with the answer
  fullName = signal('');
  email = signal('');
  phone = signal('');
  cvFile = signal<File | null>(null);
  consent = signal(false);
  needsProfile = computed(() => !!this.interview()?.needsProfile && this.action() !== 'decline');

  // Send was pressed with something missing: from then on, invalid fields are outlined red
  attempted = signal(false);
  invalid = computed(() => {
    const show = this.attempted() && this.needsProfile();
    const file = this.cvFile();
    return {
      name: show && !this.fullName().trim(),
      email: show && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim()),
      phone: show && this.phone().replace(/\D/g, '').length < 6,
      cv: show && (!file || !/\.(pdf|docx?)$/i.test(file.name) || file.size > 5 * 1024 * 1024),
      consent: show && !this.consent(),
      times: this.attempted() && this.action() === 'reschedule' && !this.futureProposals().length,
    };
  });
  /** Under the step: the first thing still missing (updates as it's fixed), else the server's error */
  errorText = computed(() => {
    if (this.attempted()) {
      if (this.invalid().times) return 'მიუთითეთ მინიმუმ ერთი მომავალი დრო';
      const missing = this.needsProfile() ? this.checkProfile() : '';
      if (missing) return missing;
    }
    return this.sendError();
  });

  maxProposals = MAX_ALTERNATIVES;
  declineReasons = DECLINE_REASONS;
  day = formatDay;
  time = formatTime;
  short = (iso: string) => formatShort(iso);

  view = computed<View>(() => {
    const iv = this.interview();
    if (!iv || !iv.canRespond) return 'closed';
    if (this.action()) return 'step';
    return iv.status === 'PENDING' || this.changing() ? 'choose' : 'result';
  });
  /** While answering, the details fold into one line so the step's form comes first */
  compact = computed(() => this.view() === 'step');
  detailsOpen = signal(false);

  /** The time the interview is at; on the confirm step, the one picked */
  when = computed(() => {
    const iv = this.interview();
    if (!iv) return null;
    const alt = this.action() === 'confirm' ? iv.alternatives.find((a) => a.slot === this.slot()) : undefined;
    return alt?.startsAt ?? iv.startsAt;
  });
  parts = computed(() => (this.when() ? dateParts(this.when()!) : null));
  relative = computed(() => (this.when() ? relativeDay(this.when()!) : ''));
  endTime = computed(() => {
    const iv = this.interview();
    const start = this.when();
    return iv && start ? formatTime(new Date(new Date(start).getTime() + iv.durationMin * 60000)) : '';
  });
  isLink = computed(() => /^https?:\/\/\S+$/i.test(this.interview()?.location.trim() ?? ''));
  /** Who invites: the company, else the HR */
  host = computed(() => this.interview()?.company || this.interview()?.hrName || 'Job Up');
  /** The company's badge (no logos stored yet): its first letter */
  monogram = computed(() => this.host().trim().charAt(0).toUpperCase() || 'J');
  /** Confirming needs more than a tap: a time to pick, or the new candidate's details */
  confirmNeedsStep = computed(() => {
    const iv = this.interview();
    return !!iv && (iv.alternatives.length > 0 || iv.needsProfile);
  });
  /** The folded confirm accordion's line: what confirming takes */
  confirmNeeds = computed(() => {
    const iv = this.interview();
    if (!iv) return '';
    // Kept to one line on a phone
    return [iv.alternatives.length && 'აირჩიეთ დრო', iv.needsProfile && (iv.alternatives.length ? 'მონაცემები და CV' : 'შეავსეთ მონაცემები და CV')]
      .filter(Boolean)
      .join(' · ');
  });
  /** "Add to Google Calendar" once confirmed */
  calendarUrl = computed(() => {
    const iv = this.interview();
    if (!iv || iv.status !== 'CONFIRMED') return null;
    const start = new Date(iv.startsAt);
    const end = new Date(start.getTime() + iv.durationMin * 60000);
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `გასაუბრება: ${iv.position}${iv.company ? ` · ${iv.company}` : ''}`,
      dates: `${calendarStamp(start)}/${calendarStamp(end)}`,
      details: [iv.hrName && `HR: ${iv.hrName}`, this.isLink() && iv.location, iv.message].filter(Boolean).join('\n'),
      location: iv.format === 'ONLINE' ? iv.location || 'ონლაინ' : iv.location,
    });
    return `https://calendar.google.com/calendar/render?${params}`;
  });

  constructor() {
    // A private link: keep it out of search engines
    inject(Meta).updateTag({ name: 'robots', content: 'noindex, nofollow' });
  }

  async ngOnInit() {
    // The email's buttons open their answer's step right away
    const query = this.route.snapshot.queryParamMap;
    const a = query.get('a');
    const slot = Number(query.get('slot'));
    if (query.has('slot') && Number.isInteger(slot)) this.slot.set(slot);

    try {
      const iv = await firstValueFrom(this.hrService.getPublicInterview(this.token));
      this.interview.set(iv);
      if (iv.inviteeEmail) this.email.set(iv.inviteeEmail);
      // An offered time that is no longer available falls back to the main time
      if (!iv.alternatives.some((alt) => alt.slot === this.slot())) this.slot.set(-1);
      if (iv.canRespond && (a === 'confirm' || a === 'decline' || a === 'reschedule')) {
        // Answered already: the email button means "change it"
        if (iv.status !== 'PENDING') this.changing.set(true);
        this.choose(a);
      }
    } catch (err) {
      this.loadError.set(this.message(err, 'ბმული არასწორია ან ვადაგასულია'));
    } finally {
      this.loading.set(false);
    }
  }

  choose(action: Action) {
    this.action.set(action);
    this.sendError.set('');
    this.attempted.set(false);
    this.detailsOpen.set(false);
    if (action === 'reschedule') this.ensureProposal();
    // The step starts right under the folded details
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** The big "confirm": sends at once unless there's a time to pick or details to give */
  confirm() {
    if (this.confirmNeedsStep()) this.choose('confirm');
    else {
      this.action.set('confirm');
      void this.send();
    }
  }

  back() {
    this.action.set(null);
    this.sendError.set('');
    this.attempted.set(false);
    this.editingProposal.set(null);
    this.detailsOpen.set(false);
  }

  /** "Change my answer" after answering */
  change() {
    this.changing.set(true);
    this.sendError.set('');
  }

  pickReason(reason: string) {
    this.note.set(this.note() === reason ? '' : reason);
  }

  addProposal() {
    if (this.proposals().length >= MAX_ALTERNATIVES) return;
    // A day after the invitation's time (or the previous suggestion), same hour
    const base = new Date(this.proposals().at(-1) ?? this.interview()?.startsAt ?? Date.now());
    base.setDate(base.getDate() + 1);
    this.proposals.update((list) => [...list, base.toISOString()]);
    this.editingProposal.set(this.proposals().length - 1);
  }

  setProposal(index: number, value: string | null) {
    if (value) this.proposals.update((list) => list.map((s, i) => (i === index ? value : s)));
  }

  removeProposal(index: number) {
    this.proposals.update((list) => list.filter((_, i) => i !== index));
    this.editingProposal.set(null);
  }

  async send() {
    const action = this.action();
    if (!action || this.sending()) return;
    const answer: Answer = { action };
    if (action === 'confirm' && this.slot() >= 0) answer.slot = this.slot();
    if (action !== 'confirm' && this.note().trim()) answer.note = this.note().trim();
    if (action === 'reschedule') {
      const times = this.futureProposals();
      if (!times.length) {
        this.showInvalid();
        return;
      }
      answer.proposedTimes = times;
    }

    if (this.needsProfile() && this.checkProfile()) {
      this.showInvalid();
      return;
    }

    this.sending.set(true);
    this.sendError.set('');
    try {
      const saved =
        this.needsProfile() && action !== 'decline'
          ? await firstValueFrom(
              this.hrService.joinInterview(
                this.token,
                { ...answer, action, fullName: this.fullName().trim(), email: this.email().trim(), phoneNumber: this.phone().trim() },
                this.cvFile()!,
              ),
            )
          : await firstValueFrom(this.hrService.answerInterview(this.token, answer));
      this.interview.set(saved);
      this.action.set(null);
      this.changing.set(false);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      this.sendError.set(this.message(err, 'პასუხის გაგზავნა ვერ მოხერხდა, სცადეთ თავიდან'));
      // A one-tap confirm has no step to show the error on: open it
      if (action === 'confirm' && !this.confirmNeedsStep()) this.action.set('confirm');
    } finally {
      this.sending.set(false);
    }
  }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    this.cvFile.set(input.files?.[0] ?? null);
    this.sendError.set('');
  }

  /** The new candidate's details: '' when complete, otherwise what's missing. */
  private checkProfile(): string {
    if (!this.fullName().trim()) return 'მიუთითეთ სახელი და გვარი';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim())) return 'მიუთითეთ სწორი ელ-ფოსტა';
    if (this.phone().replace(/\D/g, '').length < 6) return 'მიუთითეთ ტელეფონის ნომერი';
    const file = this.cvFile();
    if (!file) return 'ატვირთეთ CV (PDF ან Word)';
    if (!/\.(pdf|docx?)$/i.test(file.name)) return 'CV უნდა იყოს PDF ან Word ფაილი';
    if (file.size > 5 * 1024 * 1024) return 'CV-ის ზომა არ უნდა აღემატებოდეს 5MB-ს';
    if (!this.consent()) return 'დაადასტურეთ თანხმობა';
    return '';
  }

  /** The candidate's suggested times that are still ahead, without repeats */
  private futureProposals() {
    return [...new Set(this.proposals())].filter((iso) => new Date(iso).getTime() > Date.now());
  }

  /** Outline what's missing and bring the first such field into view (the message follows in errorText) */
  private showInvalid() {
    this.attempted.set(true);
    this.sendError.set('');
    if (typeof document === 'undefined') return;
    requestAnimationFrame(() => {
      const first = document.querySelector<HTMLElement>('.step .invalid');
      if (!first) return;
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (first.matches('input') ? first : first.querySelector<HTMLElement>('input'))?.focus({ preventScroll: true });
    });
  }

  private ensureProposal() {
    if (!this.proposals().length) this.addProposal();
  }

  private message(err: unknown, fallback: string) {
    const message = (err as HttpErrorResponse)?.error?.message;
    return typeof message === 'string' && /[Ⴀ-ჿ]/.test(message) ? message : fallback;
  }
}

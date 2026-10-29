import { AfterViewInit, Component, computed, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { BoardCard, HrInterview, InterviewDraft, InterviewFormat } from '../../../Core/Interfaces/hr';
import { HrService } from '../../../Core/Services/hr';
import { GoogleCalendar } from '../../../Core/Services/google-calendar';
import { defaultInterviewStart, DURATIONS, formatDay, formatShort, formatTime, MAX_ALTERNATIVES } from '../../../Core/Utils/interview';
import { HrStore } from '../../../Store/hr.store';
import { DateTimePicker } from '../../shared/date-time-picker/date-time-picker';
import { SelectMenu, SelectOption } from '../../shared/select-menu/select-menu';

/**
 * Schedule an interview for a card (or edit one). Opened when a card moves to "Interview";
 * then "skip" just moves the card without an interview. Saves through the store.
 * With `invite`, there is no card: it makes an invitation link (one person, valid a day) for the HR to share;
 * whoever opens it joins the board by accepting with their details and CV.
 */
@Component({
  selector: 'app-hr-interview-dialog',
  imports: [DateTimePicker, SelectMenu],
  templateUrl: './hr-interview-dialog.html',
  styleUrl: './hr-interview-dialog.scss',
})
export class HrInterviewDialog implements OnInit, AfterViewInit {
  private hrStore = inject(HrStore);
  private hrService = inject(HrService);
  private googleCalendar = inject(GoogleCalendar);

  card = input<BoardCard | null>(null);
  /** Edit this interview instead of creating one */
  interview = input<HrInterview | null>(null);
  /** Invite a new candidate (no card) to this vacancy's board; null vacancy = pick one or none */
  invite = input<{ vacancyId: number | null } | null>(null);
  /** Opened by a stage move: offers moving without an interview */
  fromMove = input(false);

  saved = output<HrInterview>();
  skip = output<void>();
  cancel = output<void>();

  durations = DURATIONS;
  maxAlternatives = MAX_ALTERNATIVES;
  short = (iso: string) => formatShort(iso);

  /** ISO, local time picked in the picker */
  startsAt = signal<string | null>(null);
  durationMin = signal(45);
  format = signal<InterviewFormat>('ONLINE');
  location = signal('');
  message = signal('');
  alternatives = signal<string[]>([]);
  // The alternative being edited in its own picker
  editingAlt = signal<number | null>(null);
  send = signal(true);
  saving = signal(false);
  error = signal('');

  // Google Meet: a separate generated link per interview, once the HR's Google account is connected
  google = this.googleCalendar.connection;
  connectingGoogle = this.googleCalendar.connecting;
  googleMeet = signal(true);
  useMeet = computed(() => this.format() === 'ONLINE' && !!this.google()?.connected && this.googleMeet());
  // The link this interview already has (kept on edit)
  currentMeet = computed(() => (this.interview()?.googleMeet ? this.interview()!.location : null));

  // Invite mode: which vacancy board the candidate joins; then the link to share
  inviteVacancyId = signal<number | null>(null);
  inviting = computed(() => !!this.invite() && !this.interview());
  vacancyOptions = computed<SelectOption<number | null>[]>(() => [
    { value: null, label: 'ვაკანსიის გარეშე', hint: 'მხოლოდ მთავარ დაფაზე', icon: 'dashboard' },
    ...this.hrStore
      .vacancies()
      .filter((v) => v.status === 'OPEN')
      .map((v) => ({ value: v.id, label: v.title, icon: 'work', group: 'ვაკანსიები' })),
  ]);
  createdInvite = signal<HrInterview | null>(null);
  copied = signal(false);
  expiresAt = computed(() => {
    const iso = this.createdInvite()?.inviteExpiresAt;
    return iso ? `${formatDay(iso)}, ${formatTime(iso)}` : '';
  });

  email = computed(() => (this.inviting() ? null : (this.card()?.contact?.email ?? this.interview()?.inviteeEmail ?? null)));
  name = computed(() => {
    if (this.inviting()) return 'ბმული ერთი კანდიდატისთვის';
    const card = this.card();
    return card?.contact?.fullName || card?.detectedRole || this.interview()?.inviteeName || 'კანდიდატი';
  });
  editing = computed(() => !!this.interview());
  // Edit of an invitation that was never emailed: the checkbox sends it now
  neverSent = computed(() => this.editing() && !this.interview()!.sentTo);
  preview = computed(() => {
    const iso = this.startsAt();
    return iso ? `${formatDay(iso)}, ${formatTime(iso)}` : '';
  });
  // A changed time needs the candidate's confirmation again
  timeChanged = computed(() => {
    const iv = this.interview();
    return !!iv && !!this.startsAt() && new Date(this.startsAt()!).getTime() !== new Date(iv.startsAt).getTime();
  });

  private dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  ngOnInit() {
    const iv = this.interview();
    this.startsAt.set((iv ? new Date(iv.startsAt) : defaultInterviewStart()).toISOString());
    if (iv) {
      this.durationMin.set(iv.durationMin);
      this.format.set(iv.format);
      // Also a generated link: if Google got disconnected since, it stays as a typed one
      this.location.set(iv.location);
      this.message.set(iv.message ?? '');
      this.alternatives.set([...iv.alternatives]);
      // Editing an interview with a typed link keeps it unless the HR switches Meet on
      this.googleMeet.set(iv.googleMeet || (iv.format === 'ONLINE' && !iv.location));
    }
    this.send.set(!!this.email());
    this.inviteVacancyId.set(this.invite()?.vacancyId ?? null);
    if (this.inviting()) this.hrStore.loadVacancies();
    this.googleCalendar.load();
  }

  async connectGoogle() {
    this.error.set('');
    const result = await this.googleCalendar.connect();
    if (result.ok) this.googleMeet.set(true);
    else if (result.error) this.error.set(result.error);
  }

  ngAfterViewInit() {
    this.dialog()?.nativeElement.focus();
  }

  addAlternative() {
    if (this.alternatives().length >= MAX_ALTERNATIVES) return;
    // Next day, same time as the main slot
    const base = new Date(this.startsAt() ?? defaultInterviewStart());
    base.setDate(base.getDate() + this.alternatives().length + 1);
    this.alternatives.update((list) => [...list, base.toISOString()]);
    this.editingAlt.set(this.alternatives().length - 1);
  }

  setAlternative(index: number, value: string | null) {
    if (value) this.alternatives.update((list) => list.map((s, i) => (i === index ? value : s)));
  }

  removeAlternative(index: number) {
    this.alternatives.update((list) => list.filter((_, i) => i !== index));
    this.editingAlt.set(null);
  }

  async submit() {
    const startsAt = this.startsAt();
    if (!startsAt || this.saving()) return;
    if (new Date(startsAt).getTime() <= Date.now()) {
      this.error.set('აირჩიეთ მომავალი დრო');
      return;
    }
    const alternatives = [...new Set(this.alternatives())].filter(
      (iso) => iso !== startsAt && new Date(iso).getTime() > Date.now(),
    );
    const useMeet = this.useMeet();
    const draft: InterviewDraft = {
      startsAt,
      durationMin: this.durationMin(),
      format: this.format(),
      location: useMeet ? '' : this.location().trim(),
      message: this.message().trim(),
      alternatives,
      // Connection unknown (status didn't load): leave an existing Meet link as it is
      googleMeet: this.google() ? useMeet : undefined,
    };
    const send = this.send() && !!this.email();

    this.saving.set(true);
    this.error.set('');
    try {
      const iv = this.interview();
      const card = this.card();
      const vacancyId = this.inviteVacancyId();
      if (!iv && (this.inviting() || !card)) {
        // Stay open on the link: the HR shares it themselves
        this.createdInvite.set(await this.hrStore.inviteToInterview({ ...draft, ...(vacancyId !== null && { vacancyId }) }));
        return;
      }
      const saved = iv
        ? await this.hrStore.updateInterview(iv.id, { ...draft, notify: send })
        : await this.hrStore.scheduleInterview(card!, draft, send);
      this.saved.emit(saved);
    } catch (err: any) {
      this.error.set(this.hrService.errorMessage(err, 'გასაუბრების შენახვა ვერ მოხერხდა'));
      // The board didn't know about the candidate's interview (e.g. scheduled from another tab):
      // reload so the card shows it and can be edited instead.
      if (err?.status === 409) this.hrStore.loadInterviews(true);
    } finally {
      this.saving.set(false);
    }
  }

  async copyInviteLink() {
    const link = this.createdInvite()?.link;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // No clipboard access (http, permissions): the link is selectable in the field
      this.copied.set(false);
    }
  }

  /** Closing: an invite that was made counts as saved */
  close() {
    const invite = this.createdInvite();
    if (invite) this.saved.emit(invite);
    else this.cancel.emit();
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      // The board also listens for Escape; this dialog is on top
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }
}

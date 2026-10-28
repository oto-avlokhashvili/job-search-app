import { AfterViewInit, Component, computed, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { BoardCard, HrInterview, InterviewDraft, InterviewFormat } from '../../../Core/Interfaces/hr';
import { HrService } from '../../../Core/Services/hr';
import { defaultInterviewStart, DURATIONS, formatDay, formatShort, formatTime, MAX_ALTERNATIVES } from '../../../Core/Utils/interview';
import { HrStore } from '../../../Store/hr.store';
import { DateTimePicker } from '../../shared/date-time-picker/date-time-picker';

/**
 * Schedule an interview for a card (or edit one). Opened when a card moves to "Interview";
 * then "skip" just moves the card without an interview. Saves through the store.
 */
@Component({
  selector: 'app-hr-interview-dialog',
  imports: [DateTimePicker],
  templateUrl: './hr-interview-dialog.html',
  styleUrl: './hr-interview-dialog.scss',
})
export class HrInterviewDialog implements OnInit, AfterViewInit {
  private hrStore = inject(HrStore);
  private hrService = inject(HrService);

  card = input.required<BoardCard>();
  /** Edit this interview instead of creating one */
  interview = input<HrInterview | null>(null);
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

  email = computed(() => this.card().contact?.email ?? null);
  name = computed(() => this.card().contact?.fullName || this.card().detectedRole || 'კანდიდატი');
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
      this.location.set(iv.location);
      this.message.set(iv.message ?? '');
      this.alternatives.set([...iv.alternatives]);
    }
    this.send.set(!!this.email());
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
    const draft: InterviewDraft = {
      startsAt,
      durationMin: this.durationMin(),
      format: this.format(),
      location: this.location().trim(),
      message: this.message().trim(),
      alternatives,
    };
    const send = this.send() && !!this.email();

    this.saving.set(true);
    this.error.set('');
    try {
      const iv = this.interview();
      const saved = iv
        ? await this.hrStore.updateInterview(iv.id, { ...draft, notify: send })
        : await this.hrStore.scheduleInterview(this.card(), draft, send);
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

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      // The board also listens for Escape; this dialog is on top
      event.preventDefault();
      event.stopPropagation();
      this.cancel.emit();
    }
  }
}

import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Meta } from '@angular/platform-browser';
import { HrService } from '../../../Core/Services/hr';
import { InterviewAnswer as Answer, PublicInterview } from '../../../Core/Interfaces/hr';
import { formatDay, formatShort, formatTime, MAX_ALTERNATIVES } from '../../../Core/Utils/interview';
import { DateTimePicker } from '../../shared/date-time-picker/date-time-picker';

type Action = Answer['action'];

/**
 * Where the buttons of an interview email lead. The email button only picks the action;
 * the answer is sent from here with one more tap, so link scanners opening the email can't answer for the candidate.
 */
@Component({
  selector: 'app-interview-answer',
  imports: [DateTimePicker],
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
  // Just answered: show the result instead of the form until "change" is pressed
  answered = signal(false);

  maxProposals = MAX_ALTERNATIVES;
  day = formatDay;
  time = formatTime;
  short = (iso: string) => formatShort(iso);

  endTime = computed(() => {
    const iv = this.interview();
    return iv ? formatTime(new Date(new Date(iv.startsAt).getTime() + iv.durationMin * 60000)) : '';
  });
  isLink = computed(() => /^https?:\/\/\S+$/i.test(this.interview()?.location.trim() ?? ''));
  // Show the answer form: allowed, and either no answer yet or the candidate wants to change it
  showForm = computed(() => {
    const iv = this.interview();
    return !!iv && iv.canRespond && !this.answered() && (iv.status === 'PENDING' || this.action() !== null);
  });

  constructor() {
    // A private link: keep it out of search engines
    inject(Meta).updateTag({ name: 'robots', content: 'noindex, nofollow' });
  }

  async ngOnInit() {
    const query = this.route.snapshot.queryParamMap;
    const a = query.get('a');
    if (a === 'confirm' || a === 'decline' || a === 'reschedule') this.action.set(a);
    const slot = Number(query.get('slot'));
    if (query.has('slot') && Number.isInteger(slot)) this.slot.set(slot);

    try {
      const iv = await firstValueFrom(this.hrService.getPublicInterview(this.token));
      this.interview.set(iv);
      // An offered time that is no longer available falls back to the main time
      if (!iv.alternatives.some((alt) => alt.slot === this.slot())) this.slot.set(-1);
      if (iv.status === 'PENDING' && !this.action()) this.action.set('confirm');
    } catch (err) {
      this.loadError.set(this.message(err, 'ბმული არასწორია ან ვადაგასულია'));
    } finally {
      this.loading.set(false);
    }
    if (this.action() === 'reschedule') this.ensureProposal();
  }

  choose(action: Action) {
    this.action.set(action);
    this.sendError.set('');
    if (action === 'reschedule') this.ensureProposal();
  }

  /** "Change my answer" after answering */
  change() {
    this.answered.set(false);
    this.action.set('confirm');
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
      const times = [...new Set(this.proposals())].filter((iso) => new Date(iso).getTime() > Date.now());
      if (!times.length) {
        this.sendError.set('მიუთითეთ მინიმუმ ერთი მომავალი დრო');
        return;
      }
      answer.proposedTimes = times;
    }

    this.sending.set(true);
    this.sendError.set('');
    try {
      this.interview.set(await firstValueFrom(this.hrService.answerInterview(this.token, answer)));
      this.answered.set(true);
      this.action.set(null);
    } catch (err) {
      this.sendError.set(this.message(err, 'პასუხის გაგზავნა ვერ მოხერხდა, სცადეთ თავიდან'));
    } finally {
      this.sending.set(false);
    }
  }

  private ensureProposal() {
    if (!this.proposals().length) this.addProposal();
  }

  private message(err: unknown, fallback: string) {
    const message = (err as HttpErrorResponse)?.error?.message;
    return typeof message === 'string' && /[Ⴀ-ჿ]/.test(message) ? message : fallback;
  }
}

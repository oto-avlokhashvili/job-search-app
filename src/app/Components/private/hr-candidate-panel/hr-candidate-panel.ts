import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { CandidateActivity, HrCandidate, HrInterview, PipelineStage } from '../../../Core/Interfaces/hr';
import { formatDay, formatShort, formatTime, INTERVIEW_STATUS } from '../../../Core/Utils/interview';

// History lines for interview events; the candidate's own answers are signed with their name
const INTERVIEW_EVENTS: Record<string, { label: string; icon: string; color: string; byCandidate?: boolean }> = {
  INTERVIEW_SCHEDULED: { label: 'გასაუბრება დაიგეგმა:', icon: 'event', color: '#f59e0b' },
  INTERVIEW_UPDATED: { label: 'გასაუბრება შეიცვალა:', icon: 'edit_calendar', color: '#f59e0b' },
  INTERVIEW_CONFIRMED: { label: 'გასაუბრება დადასტურდა:', icon: 'event_available', color: '#22c55e', byCandidate: true },
  INTERVIEW_DECLINED: { label: 'კანდიდატმა უარი თქვა:', icon: 'event_busy', color: '#ef4444', byCandidate: true },
  INTERVIEW_RESCHEDULE_REQUESTED: { label: 'კანდიდატმა სხვა დრო ითხოვა:', icon: 'update', color: '#8b5cf6', byCandidate: true },
  INTERVIEW_CANCELLED: { label: 'გასაუბრება გაუქმდა:', icon: 'event_busy', color: '#64748b' },
};
import { HrService } from '../../../Core/Services/hr';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { MAX_TAGS, pipelineOf, STAGE_BY_ID } from '../../../Core/Utils/pipeline';
import { HrStore } from '../../../Store/hr.store';
import { HrCandidateCard } from '../hr-candidate-card/hr-candidate-card';
import { HrStageMenu } from '../hr-stage-menu/hr-stage-menu';
import { HrVacancyPicker } from '../hr-vacancy-picker/hr-vacancy-picker';

/**
 * Modal for one board card: vacancy, stage, rating, tags, notes and history, plus the full card.
 * Notes and history are per candidate, shared by all of its cards.
 * Board changes go out as outputs (the page owns the store and the reject dialog); notes are saved here.
 */
@Component({
  selector: 'app-hr-candidate-panel',
  imports: [DatePipe, HrCandidateCard, HrStageMenu, HrVacancyPicker],
  templateUrl: './hr-candidate-panel.html',
  styleUrl: './hr-candidate-panel.scss',
})
export class HrCandidatePanel {
  private hrService = inject(HrService);
  private alertify = inject(AlertifyService);
  private hrStore = inject(HrStore);

  candidate = input.required<HrCandidate>();
  busy = input(false);
  /** Tags used on other candidates, offered while typing. */
  tagSuggestions = input<string[]>([]);

  close = output<void>();
  download = output<HrCandidate>();
  stageChange = output<PipelineStage>();
  editReason = output<void>();
  ratingChange = output<number | null>();
  tagsChange = output<string[]>();
  addToVacancy = output<number>();
  removeFromVacancy = output<void>();

  /** This card's interview, if one is scheduled */
  interview = input<HrInterview | null>(null);
  scheduleInterview = output<void>();
  editInterview = output<HrInterview>();
  cancelInterview = output<HrInterview>();
  acceptProposed = output<{ interview: HrInterview; index: number }>();

  interviewStatus = INTERVIEW_STATUS;
  day = formatDay;
  time = formatTime;
  short = (iso: string) => formatShort(iso);
  copied = signal(false);

  stageById = STAGE_BY_ID;
  maxTags = MAX_TAGS;
  stars = [1, 2, 3, 4, 5];

  pipeline = computed(() => pipelineOf(this.candidate()));

  private titles = computed(() => new Map(this.hrStore.vacancies().map((v) => [v.id, v.title])));
  vacancyTitle = computed(() => {
    const id = this.pipeline().vacancyId;
    return id === null ? null : (this.titles().get(id) ?? null);
  });
  // The CV's cards on other vacancies' boards (it can be in several)
  private siblings = computed(() =>
    this.hrStore.board().filter((c) => c.id === this.candidate().id && c.pipeline.vacancyId !== null),
  );
  otherVacancies = computed(() =>
    this.siblings()
      .filter((c) => c.pipeline.id !== this.pipeline().id && this.titles().has(c.pipeline.vacancyId!))
      .map((c) => ({ vacancyId: c.pipeline.vacancyId!, title: this.titles().get(c.pipeline.vacancyId!)!, stage: c.pipeline.stage })),
  );
  // The picker marks the vacancies the CV is already in
  pickerCandidate = computed(() => ({
    ...this.candidate(),
    vacancies: this.siblings().map((c) => ({ entryId: c.pipeline.id, vacancyId: c.pipeline.vacancyId!, stage: c.pipeline.stage })),
  }));
  stage = computed(() => STAGE_BY_ID[this.pipeline().stage]);
  hoverRating = signal(0);
  shownRating = computed(() => this.hoverRating() || this.pipeline().rating || 0);

  tagInput = signal('');
  suggestions = computed(() => {
    const own = new Set(this.pipeline().tags.map((t) => t.toLowerCase()));
    const typed = this.tagInput().trim().toLowerCase();
    return this.tagSuggestions()
      .filter((t) => !own.has(t.toLowerCase()) && (!typed || t.toLowerCase().includes(typed)))
      .slice(0, 6);
  });

  activity = signal<CandidateActivity[]>([]);
  activityLoading = signal(false);
  activityError = signal('');
  noteText = signal('');
  savingNote = signal(false);
  deletingNoteId = signal<number | null>(null);

  private panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    // New candidate opened: fresh history and inputs
    effect(() => {
      const id = this.candidate().id;
      untracked(() => {
        this.noteText.set('');
        this.tagInput.set('');
        this.activity.set([]);
        this.loadActivity(id);
      });
    });
    // Keyboard users land in the panel
    afterNextRender(() => this.panel()?.nativeElement.focus());
  }

  /** Also called by the page after a stage/rating change has been saved. */
  async loadActivity(id = this.candidate().id) {
    this.activityLoading.set(true);
    this.activityError.set('');
    try {
      const items = await firstValueFrom(this.hrService.getActivity(id));
      if (this.candidate().id === id) this.activity.set(items);
    } catch (err) {
      if (this.candidate().id === id) {
        this.activityError.set(this.hrService.errorMessage(err, 'ისტორიის ჩატვირთვა ვერ მოხერხდა'));
      }
    } finally {
      if (this.candidate().id === id) this.activityLoading.set(false);
    }
  }

  interviewEvent(item: CandidateActivity) {
    return INTERVIEW_EVENTS[item.kind] ?? { label: item.kind, icon: 'event', color: 'var(--text-muted)' };
  }

  /** Interview answers come from the candidate, not the HR who owns the history. */
  authorOf(item: CandidateActivity): string {
    return INTERVIEW_EVENTS[item.kind]?.byCandidate ? this.candidate().contact?.fullName || 'კანდიდატი' : item.author.name;
  }

  endTime(iv: HrInterview) {
    return formatTime(new Date(new Date(iv.startsAt).getTime() + iv.durationMin * 60000));
  }

  isUrl(value: string) {
    return /^https?:\/\/\S+$/i.test(value.trim());
  }

  async copyLink(iv: HrInterview) {
    try {
      await navigator.clipboard.writeText(iv.link);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.alertify.message(iv.link);
    }
  }

  /** History is shared by the CV's cards: name the vacancy a stage change was made in. */
  eventVacancy(item: CandidateActivity): string | null {
    return item.vacancyId ? (this.titles().get(item.vacancyId) ?? null) : null;
  }

  setRating(value: number) {
    // Clicking the current rating clears it
    this.ratingChange.emit(value === this.pipeline().rating ? null : value);
  }

  addTag(raw = this.tagInput()) {
    const tag = raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
    this.tagInput.set('');
    const tags = this.pipeline().tags;
    if (!tag || tags.length >= MAX_TAGS || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    this.tagsChange.emit([...tags, tag]);
  }

  removeTag(tag: string) {
    this.tagsChange.emit(this.pipeline().tags.filter((t) => t !== tag));
  }

  onTagKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addTag();
    } else if (event.key === 'Backspace' && !this.tagInput() && this.pipeline().tags.length) {
      this.removeTag(this.pipeline().tags[this.pipeline().tags.length - 1]);
    }
  }

  async addNote() {
    const body = this.noteText().trim();
    if (!body || this.savingNote()) return;
    const id = this.candidate().id;
    this.savingNote.set(true);
    try {
      const item = await firstValueFrom(this.hrService.addNote(id, body));
      if (this.candidate().id === id) {
        this.activity.update((list) => [item, ...list]);
        this.noteText.set('');
      }
    } catch (err) {
      this.alertify.error(this.hrService.errorMessage(err, 'ჩანაწერის შენახვა ვერ მოხერხდა'));
    } finally {
      this.savingNote.set(false);
    }
  }

  onNoteKeydown(event: KeyboardEvent) {
    // Ctrl/Cmd+Enter saves; plain Enter keeps adding lines
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.addNote();
    }
  }

  async deleteNote(item: CandidateActivity) {
    if (!item.noteId) return;
    this.deletingNoteId.set(item.noteId);
    try {
      await firstValueFrom(this.hrService.deleteNote(item.noteId));
      this.activity.update((list) => list.filter((a) => a.id !== item.id));
    } catch (err) {
      this.alertify.error(this.hrService.errorMessage(err, 'ჩანაწერის წაშლა ვერ მოხერხდა'));
    } finally {
      this.deletingNoteId.set(null);
    }
  }
}

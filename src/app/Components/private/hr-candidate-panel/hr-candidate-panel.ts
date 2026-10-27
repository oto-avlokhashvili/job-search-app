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
import { CandidateActivity, HrCandidate, PipelineStage } from '../../../Core/Interfaces/hr';
import { HrService } from '../../../Core/Services/hr';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { MAX_TAGS, pipelineOf, STAGE_BY_ID } from '../../../Core/Utils/pipeline';
import { HrCandidateCard } from '../hr-candidate-card/hr-candidate-card';
import { HrStageMenu } from '../hr-stage-menu/hr-stage-menu';

/**
 * Side panel for one board candidate: stage, rating, tags, notes and history, plus the full card.
 * Board changes go out as outputs (the page owns the store and the reject dialog); notes are saved here.
 */
@Component({
  selector: 'app-hr-candidate-panel',
  imports: [DatePipe, HrCandidateCard, HrStageMenu],
  templateUrl: './hr-candidate-panel.html',
  styleUrl: './hr-candidate-panel.scss',
})
export class HrCandidatePanel {
  private hrService = inject(HrService);
  private alertify = inject(AlertifyService);

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

  stageById = STAGE_BY_ID;
  maxTags = MAX_TAGS;
  stars = [1, 2, 3, 4, 5];

  pipeline = computed(() => pipelineOf(this.candidate()));
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

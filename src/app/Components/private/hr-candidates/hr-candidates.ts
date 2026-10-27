import { afterNextRender, Component, computed, effect, ElementRef, HostListener, inject, OnInit, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { HrService } from '../../../Core/Services/hr';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { HrCandidate, PipelineChange, PipelineStage } from '../../../Core/Interfaces/hr';
import { OUTCOME_STAGES, PIPELINE_STAGES, pipelineOf, STAGE_BY_ID } from '../../../Core/Utils/pipeline';
import { HrStore } from '../../../Store/hr.store';
import { HrCandidateCard } from '../hr-candidate-card/hr-candidate-card';
import { HrPipelineCard } from '../hr-pipeline-card/hr-pipeline-card';
import { HrCandidatePanel } from '../hr-candidate-panel/hr-candidate-panel';
import { HrRejectDialog } from '../hr-reject-dialog/hr-reject-dialog';

type View = 'board' | 'list';
const VIEW_KEY = 'hr-candidates-view';

interface PendingReject {
  candidate: HrCandidate;
  /** Column order to save with the move; absent when only the reason is edited. */
  order?: number[];
  editOnly?: boolean;
}

// Candidates whose contacts this HR has opened, as a pipeline board (default) or the plain list.
// Loaded once into HrStore; unlocking on the search page adds to it there.
@Component({
  selector: 'app-hr-candidates',
  imports: [
    RouterLink,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    // Lets a drag near the board's edge scroll it sideways to the off-screen columns
    CdkScrollable,
    HrCandidateCard,
    HrPipelineCard,
    HrCandidatePanel,
    HrRejectDialog,
  ],
  templateUrl: './hr-candidates.html',
  styleUrl: './hr-candidates.scss',
})
export class HrCandidates implements OnInit {
  private hrService = inject(HrService);
  private hrStore = inject(HrStore);
  private alertify = inject(AlertifyService);

  candidates = this.hrStore.unlocked;
  // Spinner only for the very first load; later visits show the stored list right away.
  loading = computed(() => !this.hrStore.unlockedLoaded() && !this.hrStore.unlockedError());
  error = this.hrStore.unlockedError;
  busyId = signal<number | null>(null);

  stages = PIPELINE_STAGES;
  stageById = STAGE_BY_ID;
  // Final outcomes are drop zones above the board, not columns: the board shows work in progress only.
  outcomeStages = PIPELINE_STAGES.filter((s) => OUTCOME_STAGES.includes(s.id));
  boardStages = PIPELINE_STAGES.filter((s) => !OUTCOME_STAGES.includes(s.id));
  // The outcome whose list is open in the side drawer
  outcomeOpen = signal<PipelineStage | null>(null);
  view = signal<View>('board');

  /**
   * Cards per stage. Never-ordered cards (e.g. just unlocked) come first, newest first as the
   * store keeps them; then the order saved by drag-and-drop.
   */
  columns = computed(() => {
    const byStage = Object.fromEntries(this.stages.map((s) => [s.id, [] as HrCandidate[]])) as Record<
      PipelineStage,
      HrCandidate[]
    >;
    this.candidates().forEach((c) => byStage[pipelineOf(c).stage].push(c));
    for (const list of Object.values(byStage)) {
      const rank = (c: HrCandidate) => pipelineOf(c).position ?? -1;
      // Stable sort keeps the newest-first order among equal ranks
      list.sort((a, b) => rank(a) - rank(b));
    }
    return byStage;
  });

  tagSuggestions = computed(() => {
    const seen = new Map<string, string>();
    this.candidates().forEach((c) => pipelineOf(c).tags.forEach((t) => seen.set(t.toLowerCase(), t)));
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  });

  selectedId = signal<number | null>(null);
  selected = computed(() => this.candidates().find((c) => c.id === this.selectedId()) ?? null);
  pendingReject = signal<PendingReject | null>(null);

  private panel = viewChild(HrCandidatePanel);
  // The click that ends a drag must not open the panel
  private dragging = false;

  // Arrows on the board edges whenever the columns don't fit (any screen narrower than ~2000px,
  // or when the sidebar takes the room); each shows only if there is more in that direction.
  private board = viewChild<ElementRef<HTMLElement>>('board');
  canScrollLeft = signal(false);
  canScrollRight = signal(false);

  constructor() {
    // After hydration, so the server-rendered board and the browser agree on the first render
    afterNextRender(() => this.view.set(this.readView()));

    // The board only exists in board view with candidates; watch its size while it does.
    effect((onCleanup) => {
      const el = this.board()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.updateBoardArrows());
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });
  }

  updateBoardArrows() {
    const el = this.board()?.nativeElement;
    if (!el) return;
    this.canScrollLeft.set(el.scrollLeft > 2);
    this.canScrollRight.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }

  /** Moves by one column (width + gap), so a column always lands at the edge. */
  scrollBoard(direction: 1 | -1) {
    const el = this.board()?.nativeElement;
    if (!el) return;
    const column = el.querySelector<HTMLElement>('.column');
    const step = column ? column.offsetWidth + parseFloat(getComputedStyle(el).columnGap || '0') : el.clientWidth * 0.8;
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  ngOnInit() {
    this.hrStore.loadUnlocked();
  }

  setView(view: View) {
    this.view.set(view);
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Private mode / blocked storage: the choice just isn't remembered
    }
  }

  onDragStarted() {
    this.dragging = true;
  }

  onDragEnded() {
    setTimeout(() => (this.dragging = false));
  }

  open(candidate: HrCandidate) {
    if (!this.dragging) this.selectedId.set(candidate.id);
  }

  close() {
    this.selectedId.set(null);
  }

  openOutcome(stage: PipelineStage) {
    // A drop onto the zone also ends in a click; that must not open the drawer
    if (!this.dragging) this.outcomeOpen.set(stage);
  }

  closeOutcome() {
    this.outcomeOpen.set(null);
  }

  drop(event: CdkDragDrop<PipelineStage, PipelineStage, HrCandidate>) {
    const candidate = event.item.data;
    const from = event.previousContainer.data;
    const to = event.container.data;
    if (from === to && event.previousIndex === event.currentIndex) return;

    const order = this.columns()[to].map((c) => c.id).filter((id) => id !== candidate.id);
    order.splice(event.currentIndex, 0, candidate.id);

    if (to === 'REJECTED' && from !== 'REJECTED') {
      this.pendingReject.set({ candidate, order });
      return;
    }
    this.save(candidate, from === to ? {} : { stage: to }, order);
  }

  /** Stage menu (card or panel): the candidate goes to the top of its new column. */
  moveTo(candidate: HrCandidate, stage: PipelineStage) {
    const order = [candidate.id, ...this.columns()[stage].map((c) => c.id).filter((id) => id !== candidate.id)];
    if (stage === 'REJECTED') {
      this.pendingReject.set({ candidate, order });
      return;
    }
    this.save(candidate, { stage }, order);
  }

  editReason(candidate: HrCandidate) {
    this.pendingReject.set({ candidate, editOnly: true });
  }

  confirmReject(reason: string | null) {
    const pending = this.pendingReject();
    this.pendingReject.set(null);
    if (!pending) return;
    if (pending.editOnly) {
      this.save(pending.candidate, { rejectionReason: reason });
    } else {
      this.save(pending.candidate, { stage: 'REJECTED', rejectionReason: reason }, pending.order);
    }
  }

  rate(candidate: HrCandidate, rating: number | null) {
    this.save(candidate, { rating });
  }

  setTags(candidate: HrCandidate, tags: string[]) {
    this.save(candidate, { tags });
  }

  async download(candidate: HrCandidate) {
    this.busyId.set(candidate.id);
    try {
      await this.hrService.downloadCv(candidate.id, candidate.contact?.fullName || 'cv');
    } catch {
      this.alertify.error('CV-ის ჩამოტვირთვა ვერ მოხერხდა');
    } finally {
      this.busyId.set(null);
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event) {
    // Already handled by an open overlay (the stage menu closes itself and marks the event)
    if (event.defaultPrevented) return;
    // Layers from the top: reject dialog, candidate panel, outcome drawer. Close only the top one.
    if (this.pendingReject()) this.pendingReject.set(null);
    else if (this.selectedId() !== null) this.close();
    else this.closeOutcome();
  }

  private async save(candidate: HrCandidate, change: PipelineChange, order?: number[]) {
    try {
      await this.hrStore.updatePipeline(candidate.id, change, order);
      // Stage and rating changes show up in the panel's history
      if ((change.stage || change.rating !== undefined) && this.selectedId() === candidate.id) {
        this.panel()?.loadActivity();
      }
    } catch (err) {
      this.alertify.error(this.hrService.errorMessage(err, 'ცვლილება ვერ შეინახა, სცადეთ თავიდან'));
    }
  }

  private readView(): View {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board';
    } catch {
      return 'board';
    }
  }
}

import { afterNextRender, Component, computed, effect, ElementRef, HostListener, inject, OnInit, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { HrService } from '../../../Core/Services/hr';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { BoardCard, HrCandidate, HrVacancy, PipelineChange, PipelineStage } from '../../../Core/Interfaces/hr';
import { OUTCOME_STAGES, PIPELINE_STAGES, STAGE_BY_ID } from '../../../Core/Utils/pipeline';
import { HrStore } from '../../../Store/hr.store';
import { HrCandidateCard } from '../hr-candidate-card/hr-candidate-card';
import { HrPipelineCard } from '../hr-pipeline-card/hr-pipeline-card';
import { HrCandidatePanel } from '../hr-candidate-panel/hr-candidate-panel';
import { HrRejectDialog } from '../hr-reject-dialog/hr-reject-dialog';
import { HrVacancyDialog } from '../hr-vacancy-dialog/hr-vacancy-dialog';

type View = 'board' | 'list';
type Scope = 'all' | 'none';
const VIEW_KEY = 'hr-candidates-view';

interface PendingReject {
  card: BoardCard;
  /** Column order to save with the move; absent when only the reason is edited. */
  order?: number[];
  editOnly?: boolean;
}

// The HR's candidate boards, as a pipeline board (default) or the plain list.
// /hr/candidates is the main board with every card (a CV in two vacancies shows twice, labelled);
// /hr/candidates/v/:vacancyId is one vacancy's board. All cards live in HrStore; the page filters them.
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
    HrVacancyDialog,
  ],
  templateUrl: './hr-candidates.html',
  styleUrl: './hr-candidates.scss',
})
export class HrCandidates implements OnInit {
  private hrService = inject(HrService);
  private hrStore = inject(HrStore);
  private alertify = inject(AlertifyService);
  private router = inject(Router);

  /** null on the main board. */
  vacancyId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((p) => {
        const id = Number(p.get('vacancyId'));
        return Number.isInteger(id) && id > 0 ? id : null;
      }),
    ),
    { initialValue: null },
  );
  vacancy = computed(() => this.hrStore.vacancies().find((v) => v.id === this.vacancyId()) ?? null);
  // The id in the URL isn't one of this HR's vacancies (deleted, or a stale link)
  vacancyMissing = computed(() => this.vacancyId() !== null && this.hrStore.vacanciesLoaded() && !this.vacancy());
  vacancyTitles = computed(() => new Map(this.hrStore.vacancies().map((v) => [v.id, v.title])));

  // Main board only: every card, or only the ones not in any vacancy
  scope = signal<Scope>('all');
  allCount = computed(() => this.hrStore.board().length);
  unassignedCount = computed(() => this.hrStore.board().filter((c) => c.pipeline.vacancyId === null).length);

  candidates = computed(() => {
    const board = this.hrStore.board();
    const id = this.vacancyId();
    if (id !== null) return board.filter((c) => c.pipeline.vacancyId === id);
    return this.scope() === 'none' ? board.filter((c) => c.pipeline.vacancyId === null) : board;
  });
  // The list view shows each CV once, even when it's in several vacancies
  listCandidates = computed(() => {
    const seen = new Set<number>();
    return this.candidates().filter((c) => !seen.has(c.id) && seen.add(c.id));
  });
  // Spinner only for the very first load; later visits show the stored list right away.
  loading = computed(() => !this.hrStore.boardLoaded() && !this.hrStore.boardError());
  error = this.hrStore.boardError;
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
   * Cards per stage. Never-ordered cards (e.g. just added) come first, newest first as the
   * store keeps them; then the order saved by drag-and-drop.
   */
  columns = computed(() => {
    const byStage = Object.fromEntries(this.stages.map((s) => [s.id, [] as BoardCard[]])) as Record<PipelineStage, BoardCard[]>;
    this.candidates().forEach((c) => byStage[c.pipeline.stage].push(c));
    for (const list of Object.values(byStage)) {
      const rank = (c: BoardCard) => c.pipeline.position ?? -1;
      // Stable sort keeps the newest-first order among equal ranks
      list.sort((a, b) => rank(a) - rank(b));
    }
    return byStage;
  });

  tagSuggestions = computed(() => {
    const seen = new Map<string, string>();
    this.hrStore.board().forEach((c) => c.pipeline.tags.forEach((t) => seen.set(t.toLowerCase(), t)));
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  });

  // Selected card by entry id
  selectedId = signal<number | null>(null);
  selected = computed(() => this.hrStore.board().find((c) => c.pipeline.id === this.selectedId()) ?? null);
  pendingReject = signal<PendingReject | null>(null);
  renaming = signal(false);
  vacancyBusy = signal(false);

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

    // Switching to another vacancy's board: close what was open for the previous one
    effect(() => {
      this.vacancyId();
      untracked(() => {
        this.selectedId.set(null);
        this.outcomeOpen.set(null);
        this.renaming.set(false);
      });
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
    this.hrStore.loadBoard();
    this.hrStore.loadVacancies();
  }

  setView(view: View) {
    this.view.set(view);
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Private mode / blocked storage: the choice just isn't remembered
    }
  }

  /** Main board: the vacancy label on a card, unless the card has none. */
  labelFor(card: BoardCard): string | null {
    if (this.vacancyId() !== null || card.pipeline.vacancyId === null) return null;
    return this.vacancyTitles().get(card.pipeline.vacancyId) ?? null;
  }

  onDragStarted() {
    this.dragging = true;
  }

  onDragEnded() {
    setTimeout(() => (this.dragging = false));
  }

  open(card: BoardCard) {
    if (!this.dragging) this.selectedId.set(card.pipeline.id);
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

  drop(event: CdkDragDrop<PipelineStage, PipelineStage, BoardCard>) {
    const card = event.item.data;
    const from = event.previousContainer.data;
    const to = event.container.data;
    if (from === to && event.previousIndex === event.currentIndex) return;

    const entryId = card.pipeline.id;
    const order = this.columns()[to].map((c) => c.pipeline.id).filter((id) => id !== entryId);
    order.splice(event.currentIndex, 0, entryId);

    if (to === 'REJECTED' && from !== 'REJECTED') {
      this.pendingReject.set({ card, order });
      return;
    }
    this.save(card, from === to ? {} : { stage: to }, order);
  }

  /** Stage menu (card or panel): the card goes to the top of its new column. */
  moveTo(card: BoardCard, stage: PipelineStage) {
    const entryId = card.pipeline.id;
    const order = [entryId, ...this.columns()[stage].map((c) => c.pipeline.id).filter((id) => id !== entryId)];
    if (stage === 'REJECTED') {
      this.pendingReject.set({ card, order });
      return;
    }
    this.save(card, { stage }, order);
  }

  editReason(card: BoardCard) {
    this.pendingReject.set({ card, editOnly: true });
  }

  confirmReject(reason: string | null) {
    const pending = this.pendingReject();
    this.pendingReject.set(null);
    if (!pending) return;
    if (pending.editOnly) {
      this.save(pending.card, { rejectionReason: reason });
    } else {
      this.save(pending.card, { stage: 'REJECTED', rejectionReason: reason }, pending.order);
    }
  }

  rate(card: BoardCard, rating: number | null) {
    this.save(card, { rating });
  }

  setTags(card: BoardCard, tags: string[]) {
    this.save(card, { tags });
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

  /** From the panel: the CV gets a card on another vacancy's board too. */
  async addToVacancy(card: BoardCard, vacancyId: number) {
    this.busyId.set(card.id);
    try {
      const added = await this.hrStore.addToVacancy(card, vacancyId);
      this.alertify.success(`კანდიდატი დაემატა: ${this.vacancyTitles().get(vacancyId) ?? ''}`);
      // A card without a vacancy moved into the vacancy: the panel keeps showing it (same id)
      if (added.pipeline.id === card.pipeline.id) this.panel()?.loadActivity();
    } catch (err) {
      this.alertify.error(this.hrService.errorMessage(err, 'ვაკანსიაში დამატება ვერ მოხერხდა'));
    } finally {
      this.busyId.set(null);
    }
  }

  async removeFromVacancy(card: BoardCard) {
    this.busyId.set(card.id);
    try {
      await this.hrStore.removeFromVacancy(card);
      // On this vacancy's board the card is gone; the panel closes on its own (no selected card)
      this.alertify.success('კანდიდატი ამოღებულია ვაკანსიიდან');
    } catch (err) {
      this.alertify.error(this.hrService.errorMessage(err, 'ვაკანსიიდან ამოღება ვერ მოხერხდა'));
    } finally {
      this.busyId.set(null);
    }
  }

  setScope(scope: Scope) {
    this.scope.set(scope);
  }

  /** Search page with this vacancy as the target: its title as the query, adds go here first. */
  searchForVacancy(vacancy: HrVacancy) {
    this.hrStore.setSearchVacancy(vacancy.id);
    this.hrStore.search({ ...this.hrStore.searchForm(), keyword: vacancy.title });
    this.router.navigate(['/hr/search']);
  }

  async toggleClosed(vacancy: HrVacancy) {
    this.vacancyBusy.set(true);
    try {
      await this.hrStore.updateVacancy(vacancy.id, { status: vacancy.status === 'OPEN' ? 'CLOSED' : 'OPEN' });
    } catch (err) {
      this.alertify.error(this.hrService.errorMessage(err, 'ვაკანსიის შენახვა ვერ მოხერხდა'));
    } finally {
      this.vacancyBusy.set(false);
    }
  }

  deleteVacancy(vacancy: HrVacancy) {
    this.alertify.confirm(
      'ვაკანსიის წაშლა',
      `„${vacancy.title}“ წაიშლება. კანდიდატები დარჩება მთავარ დაფაზე, ჩანაწერებთან და ისტორიასთან ერთად.`,
      async () => {
        this.vacancyBusy.set(true);
        try {
          await this.hrStore.deleteVacancy(vacancy.id);
          this.router.navigate(['/hr/candidates']);
        } catch (err) {
          this.alertify.error(this.hrService.errorMessage(err, 'ვაკანსიის წაშლა ვერ მოხერხდა'));
        } finally {
          this.vacancyBusy.set(false);
        }
      },
    );
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

  private async save(card: BoardCard, change: PipelineChange, order?: number[]) {
    try {
      await this.hrStore.updatePipeline(card.pipeline.id, change, order);
      // Stage and rating changes show up in the panel's history
      if ((change.stage || change.rating !== undefined) && this.selectedId() === card.pipeline.id) {
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

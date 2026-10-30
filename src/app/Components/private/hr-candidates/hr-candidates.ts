import { afterNextRender, Component, computed, effect, ElementRef, HostListener, inject, OnInit, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { NgTemplateOutlet } from '@angular/common';
import { HrService } from '../../../Core/Services/hr';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { BoardCard, HrCandidate, HrInterview, HrVacancy, PipelineChange, PipelineStage } from '../../../Core/Interfaces/hr';
import { OUTCOME_STAGES, PIPELINE_STAGES, STAGE_BY_ID } from '../../../Core/Utils/pipeline';
import { formatShort, interviewsByEntry, interviewStatusOf, isUpcoming } from '../../../Core/Utils/interview';
import { HrInterviewDialog } from '../hr-interview-dialog/hr-interview-dialog';
import { HrStore } from '../../../Store/hr.store';
import { HrPipelineCard } from '../hr-pipeline-card/hr-pipeline-card';
import { HrStageMenu } from '../hr-stage-menu/hr-stage-menu';
import { HrCandidatePanel } from '../hr-candidate-panel/hr-candidate-panel';
import { HrRejectDialog } from '../hr-reject-dialog/hr-reject-dialog';
import { HrVacancyDialog } from '../hr-vacancy-dialog/hr-vacancy-dialog';
import { HrManualCandidateDialog } from '../hr-manual-candidate-dialog/hr-manual-candidate-dialog';

type View = 'board' | 'list';
type Scope = 'all' | 'none';
type SortKey = 'name' | 'stage' | 'rating' | 'interview';
const STAGE_ORDER = Object.fromEntries(PIPELINE_STAGES.map((s, i) => [s.id, i])) as Record<PipelineStage, number>;
const VIEW_KEY = 'hr-candidates-view';

interface PendingReject {
  card: BoardCard;
  /** Column order to save with the move; absent when only the reason is edited. */
  order?: number[];
  editOnly?: boolean;
}

interface PendingInterview {
  card: BoardCard;
  /** Edit this one instead of scheduling */
  interview?: HrInterview;
  /** Set when the dialog came from a stage move: the column order to save */
  order?: number[];
  fromMove: boolean;
}

// The HR's candidate boards, as a pipeline board (default) or the plain list.
// /hr/candidates is the main board with every card (a CV in two vacancies shows twice, labelled);
// /hr/candidates/v/:vacancyId is one vacancy's board. All cards live in HrStore; the page filters them.
@Component({
  selector: 'app-hr-candidates',
  imports: [
    RouterLink,
    NgTemplateOutlet,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    // Lets a drag near the board's edge scroll it sideways to the off-screen columns
    CdkScrollable,
    HrPipelineCard,
    HrStageMenu,
    HrCandidatePanel,
    HrRejectDialog,
    HrVacancyDialog,
    HrInterviewDialog,
    HrManualCandidateDialog,
  ],
  templateUrl: './hr-candidates.html',
  styleUrl: './hr-candidates.scss',
})
export class HrCandidates implements OnInit {
  private hrService = inject(HrService);
  private hrStore = inject(HrStore);
  private alertify = inject(AlertifyService);
  private router = inject(Router);

  private route = inject(ActivatedRoute);
  private openParam = toSignal(this.route.queryParamMap.pipe(map((q) => q.get('open'))), { initialValue: null });

  /** null on the main board. */
  vacancyId = toSignal(
    this.route.paramMap.pipe(
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
  // The list view is a table of the same cards (a CV in two vacancies is two rows, each with its vacancy),
  // in board order unless a column header sorts it
  sort = signal<{ key: SortKey; dir: 1 | -1 } | null>(null);
  rows = computed(() => {
    const ivs = this.interviewByEntry();
    const rows = this.candidates().map((card) => {
      const interview = ivs.get(card.pipeline.id) ?? null;
      return { card, name: this.nameOf(card), interview, interviewBadge: interview ? { ...interviewStatusOf(interview), when: formatShort(interview.startsAt) } : null };
    });
    const sort = this.sort();
    if (!sort) return rows;
    const value = (r: (typeof rows)[number]): string | number => {
      switch (sort.key) {
        case 'name':
          return r.name.toLowerCase();
        case 'stage':
          return STAGE_ORDER[r.card.pipeline.stage];
        case 'rating':
          return r.card.pipeline.rating ?? 0;
        case 'interview':
          // No interview last either way
          return r.interview ? new Date(r.interview.startsAt).getTime() : sort.dir * Infinity;
      }
    };
    return [...rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
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
  interviewDialog = signal<PendingInterview | null>(null);
  // The interview each card shows (by entry id)
  interviewByEntry = computed(() => interviewsByEntry(this.hrStore.interviews()));
  /** "Invite to an interview" dialog for a new candidate: the vacancy they'd join (null on the main board) */
  inviting = signal<{ vacancyId: number | null } | null>(null);
  /** "Add a candidate" by hand: the vacancy preselected (null on the main board) */
  addingManual = signal<{ vacancyId: number | null } | null>(null);
  // Invitation links nobody has used yet (no card) and still valid, for this vacancy or, on the main board, all
  pendingInvites = computed(() => {
    const vacancyId = this.vacancyId();
    const now = Date.now();
    return this.hrStore
      .interviews()
      .filter(
        (i) =>
          i.entryId === null &&
          (i.status === 'PENDING' || i.status === 'RESCHEDULE_REQUESTED') &&
          new Date(i.startsAt).getTime() > now &&
          (!i.inviteExpiresAt || new Date(i.inviteExpiresAt).getTime() > now) &&
          (vacancyId === null || i.vacancyId === vacancyId),
      ).length;
  });
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

    // ?open=<entryId> (from the interviews page): open that card once the board is there
    effect(() => {
      const open = Number(this.openParam());
      if (!open || !this.hrStore.boardLoaded()) return;
      untracked(() => {
        if (this.hrStore.board().some((c) => c.pipeline.id === open)) this.selectedId.set(open);
        this.router.navigate([], { queryParams: { open: null }, queryParamsHandling: 'merge', replaceUrl: true });
      });
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
    // Fresh on every visit: candidates answer by email in the meantime
    this.hrStore.loadInterviews(true);
  }

  setView(view: View) {
    this.view.set(view);
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Private mode / blocked storage: the choice just isn't remembered
    }
  }

  /** A column header: sort by it, again to reverse, a third time back to board order */
  sortBy(key: SortKey) {
    const cur = this.sort();
    if (cur?.key !== key) this.sort.set({ key, dir: 1 });
    else if (cur.dir === 1) this.sort.set({ key, dir: -1 });
    else this.sort.set(null);
  }

  ariaSort(key: SortKey) {
    const cur = this.sort();
    return cur?.key !== key ? 'none' : cur.dir === 1 ? 'ascending' : 'descending';
  }

  nameOf(card: BoardCard) {
    return card.contact?.fullName || card.detectedRole || 'კანდიდატი';
  }

  initialsOf(card: BoardCard) {
    return this.nameOf(card)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
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
    if (from === to) this.save(card, {}, order);
    else this.move(card, to, order);
  }

  /** Stage menu (card or panel): the card goes to the top of its new column. */
  moveTo(card: BoardCard, stage: PipelineStage) {
    const entryId = card.pipeline.id;
    const order = [entryId, ...this.columns()[stage].map((c) => c.pipeline.id).filter((id) => id !== entryId)];
    if (stage === 'REJECTED') {
      this.pendingReject.set({ card, order });
      return;
    }
    this.move(card, stage, order);
  }

  /**
   * A stage change: into "Interview" offers scheduling one (unless it already has one); leaving it
   * while an interview is still ahead asks whether to cancel that interview.
   */
  private move(card: BoardCard, stage: PipelineStage, order: number[], extra: PipelineChange = {}) {
    const from = card.pipeline.stage;
    const interview = this.interviewByEntry().get(card.pipeline.id);
    if (stage === 'INTERVIEW' && from !== 'INTERVIEW' && !(interview && isUpcoming(interview))) {
      this.interviewDialog.set({ card, order, fromMove: true });
      return;
    }
    this.save(card, { ...extra, stage }, order);
    if (from === 'INTERVIEW' && stage !== 'INTERVIEW' && interview && isUpcoming(interview)) {
      this.alertify.confirm(
        'გასაუბრების გაუქმება',
        `${formatShort(interview.startsAt)}-ზე დაგეგმილი გასაუბრება გავაუქმოთ? კანდიდატი მიიღებს შეტყობინებას.`,
        () => this.cancelInterview(interview, true),
        () => {},
      );
    }
  }

  // ─── Interviews ────────────────────────────────────────────────

  openScheduleInterview(card: BoardCard) {
    this.interviewDialog.set({ card, fromMove: false });
  }

  editInterview(card: BoardCard, interview: HrInterview) {
    this.interviewDialog.set({ card, interview, fromMove: false });
  }

  openInvite(vacancyId: number | null) {
    this.inviting.set({ vacancyId });
  }

  onInvited() {
    this.inviting.set(null);
    this.alertify.success('მოწვევის ბმული შეიქმნა: კანდიდატი დაფაზე CV-ის ატვირთვისას გამოჩნდება');
  }

  onManualAdded(card: BoardCard) {
    this.addingManual.set(null);
    const name = card.contact?.fullName || 'კანდიდატი';
    // Added to another vacancy than the one on screen: say where it went
    const elsewhere = this.vacancyId() !== null && card.pipeline.vacancyId !== this.vacancyId();
    this.alertify.success(elsewhere ? `${name} დაემატა სხვა დაფაზე` : `${name} დაემატა დაფაზე`);
  }

  onInterviewSaved() {
    const pending = this.interviewDialog();
    this.interviewDialog.set(null);
    // The server moved the card to "Interview"; show it at the top like any move
    if (pending?.order) this.save(pending.card, {}, pending.order);
    if (pending && this.selectedId() === pending.card.pipeline.id) this.panel()?.loadActivity();
    this.alertify.success(pending?.interview ? 'გასაუბრება განახლდა' : 'გასაუბრება დაიგეგმა');
  }

  /** "Just move" from the dialog: the card goes to "Interview" without one. */
  skipInterview() {
    const pending = this.interviewDialog();
    this.interviewDialog.set(null);
    if (pending) this.save(pending.card, { stage: 'INTERVIEW' }, pending.order);
  }

  async cancelInterview(interview: HrInterview, notify = true) {
    try {
      await this.hrStore.updateInterview(interview.id, { cancel: true, notify });
      this.alertify.success('გასაუბრება გაუქმდა');
      if (this.selected()?.pipeline.id === interview.entryId) this.panel()?.loadActivity();
    } catch (err) {
      this.alertify.error(this.hrService.errorMessage(err, 'გაუქმება ვერ მოხერხდა'));
    }
  }

  confirmCancelInterview(interview: HrInterview) {
    this.alertify.confirm(
      'გასაუბრების გაუქმება',
      `${formatShort(interview.startsAt)}-ზე დაგეგმილი გასაუბრება გაუქმდება${interview.sentTo ? ' და კანდიდატი მიიღებს შეტყობინებას' : ''}.`,
      () => this.cancelInterview(interview),
    );
  }

  async acceptProposed(interview: HrInterview, index: number) {
    try {
      await this.hrStore.updateInterview(interview.id, { acceptProposed: index, notify: true });
      this.alertify.success('დრო დადასტურდა, კანდიდატს ეცნობა');
      this.panel()?.loadActivity();
    } catch (err) {
      this.alertify.error(this.hrService.errorMessage(err, 'დადასტურება ვერ მოხერხდა'));
    }
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
      this.move(pending.card, 'REJECTED', pending.order ?? [], { rejectionReason: reason });
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

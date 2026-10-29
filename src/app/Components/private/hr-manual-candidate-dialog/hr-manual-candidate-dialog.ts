import { AfterViewInit, Component, computed, effect, ElementRef, inject, input, OnInit, output, signal, untracked, viewChild } from '@angular/core';
import { BoardCard } from '../../../Core/Interfaces/hr';
import { HrService } from '../../../Core/Services/hr';
import { HrStore } from '../../../Store/hr.store';
import { SelectMenu, SelectOption } from '../../shared/select-menu/select-menu';

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Add a candidate by hand: name, surname and position, no CV. From a vacancy's board that vacancy is
 * preselected; the card is always on the main board too. With a vacancy chosen, its title is the
 * position (editable); on the main board only, the position has to be typed. Saves through the store.
 */
@Component({
  selector: 'app-hr-manual-candidate-dialog',
  imports: [SelectMenu],
  templateUrl: './hr-manual-candidate-dialog.html',
  styleUrl: './hr-manual-candidate-dialog.scss',
})
export class HrManualCandidateDialog implements OnInit, AfterViewInit {
  private hrStore = inject(HrStore);
  private hrService = inject(HrService);

  /** The board it was opened from: null = main board */
  vacancyId = input<number | null>(null);
  saved = output<BoardCard>();
  cancel = output<void>();

  firstName = signal('');
  lastName = signal('');
  position = signal('');
  targetVacancyId = signal<number | null>(null);
  saving = signal(false);
  error = signal('');

  boardOptions = computed<SelectOption<number | null>[]>(() => [
    { value: null, label: 'მხოლოდ მთავარი დაფა', icon: 'dashboard' },
    ...this.hrStore
      .vacancies()
      .filter((v) => v.status === 'OPEN')
      .map((v) => ({ value: v.id, label: v.title, icon: 'work', group: 'ვაკანსიის დაფა' })),
  ]);
  /** The chosen vacancy's title: on a vacancy board that's the position, unless the HR types their own */
  vacancyTitle = computed(() => this.hrStore.vacancies().find((v) => v.id === this.targetVacancyId())?.title ?? '');
  // Only the main board needs a position typed
  positionRequired = computed(() => this.targetVacancyId() === null);
  finalPosition = computed(() => clean(this.position()) || clean(this.vacancyTitle()));
  valid = computed(() => !!clean(this.firstName()) && !!clean(this.lastName()) && !!this.finalPosition());
  /** The field holds the vacancy title (not typed): it follows the board choice */
  positionFromVacancy = signal(true);

  private firstInput = viewChild<ElementRef<HTMLInputElement>>('firstInput');

  constructor() {
    effect(() => {
      const title = this.vacancyTitle();
      if (untracked(this.positionFromVacancy)) this.position.set(title);
    });
  }

  typePosition(value: string) {
    this.position.set(value);
    // Cleared: back to following the board
    this.positionFromVacancy.set(!value.trim());
  }

  ngOnInit() {
    this.targetVacancyId.set(this.vacancyId());
    this.hrStore.loadVacancies();
  }

  ngAfterViewInit() {
    this.firstInput()?.nativeElement.focus();
  }

  async save() {
    if (!this.valid() || this.saving()) return;
    const vacancyId = this.targetVacancyId();
    this.saving.set(true);
    this.error.set('');
    try {
      const card = await this.hrStore.addManualCandidate({
        firstName: clean(this.firstName()),
        lastName: clean(this.lastName()),
        position: this.finalPosition(),
        ...(vacancyId !== null && { vacancyId }),
      });
      this.saved.emit(card);
    } catch (err) {
      this.error.set(this.hrService.errorMessage(err, 'კანდიდატის დამატება ვერ მოხერხდა'));
    } finally {
      this.saving.set(false);
    }
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      // The board page also listens for Escape; this dialog is on top
      event.preventDefault();
      event.stopPropagation();
      this.cancel.emit();
    }
  }
}

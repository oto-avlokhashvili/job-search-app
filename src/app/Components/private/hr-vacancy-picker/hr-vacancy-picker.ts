import { Component, computed, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition, Overlay } from '@angular/cdk/overlay';
import { HrCandidate } from '../../../Core/Interfaces/hr';
import { HrService } from '../../../Core/Services/hr';
import { HrStore } from '../../../Store/hr.store';

// Shown with a search box once the list gets this long
const SEARCH_FROM = 7;

/**
 * "Add to vacancy" button with a menu of the HR's open vacancies. Vacancies the CV is already in are
 * checked and disabled; a new vacancy can be created inline. The page does the actual add (`add`).
 * A locked CV can also just have its contacts opened (`unlockOnly`).
 */
@Component({
  selector: 'app-hr-vacancy-picker',
  imports: [CdkOverlayOrigin, CdkConnectedOverlay],
  templateUrl: './hr-vacancy-picker.html',
  styleUrl: './hr-vacancy-picker.scss',
})
export class HrVacancyPicker {
  private hrStore = inject(HrStore);
  private hrService = inject(HrService);

  candidate = input.required<HrCandidate>();
  busy = input(false);
  // primary: the card's main action; ghost: a secondary button next to contacts
  variant = input<'primary' | 'ghost'>('primary');
  add = output<number>();
  unlockOnly = output<void>();

  open = signal(false);
  query = signal('');
  creating = signal(false);
  newTitle = signal('');
  saving = signal(false);
  error = signal('');

  private memberOf = computed(() => new Set((this.candidate().vacancies ?? []).map((m) => m.vacancyId)));
  targetId = this.hrStore.searchVacancyId;
  loading = computed(() => !this.hrStore.vacanciesLoaded());
  openVacancies = computed(() => {
    const target = this.targetId();
    const list = this.hrStore.vacancies().filter((v) => v.status === 'OPEN');
    // The vacancy being searched for first, then most recently used
    return [...list].sort(
      (a, b) => Number(b.id === target) - Number(a.id === target) || b.updatedAt.localeCompare(a.updatedAt),
    );
  });
  showSearch = computed(() => this.openVacancies().length >= SEARCH_FROM);
  shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.openVacancies().filter((v) => v.title.toLowerCase().includes(q)) : this.openVacancies();
  });

  positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
  ];
  scrollStrategy = inject(Overlay).scrollStrategies.reposition();

  private newInput = viewChild<ElementRef<HTMLInputElement>>('newInput');

  isMember(id: number) {
    return this.memberOf().has(id);
  }

  toggle() {
    if (this.open()) return this.close();
    this.hrStore.loadVacancies();
    this.query.set('');
    this.error.set('');
    // No vacancies yet: go straight to creating one
    this.creating.set(this.hrStore.vacanciesLoaded() && this.openVacancies().length === 0);
    this.open.set(true);
    if (this.creating()) setTimeout(() => this.newInput()?.nativeElement.focus());
  }

  close() {
    this.open.set(false);
    this.creating.set(false);
    this.newTitle.set('');
  }

  choose(id: number) {
    if (this.isMember(id)) return;
    this.close();
    this.add.emit(id);
  }

  startCreate() {
    this.creating.set(true);
    this.error.set('');
    setTimeout(() => this.newInput()?.nativeElement.focus());
  }

  async create() {
    const title = this.newTitle().replace(/\s+/g, ' ').trim();
    if (!title || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const vacancy = await this.hrStore.createVacancy(title);
      this.close();
      this.add.emit(vacancy.id);
    } catch (err) {
      this.error.set(this.hrService.errorMessage(err, 'ვაკანსიის შექმნა ვერ მოხერხდა'));
    } finally {
      this.saving.set(false);
    }
  }

  chooseUnlockOnly() {
    this.close();
    this.unlockOnly.emit();
  }

  onOverlayKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }
}

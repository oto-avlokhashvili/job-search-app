import { AfterViewInit, Component, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { HrVacancy } from '../../../Core/Interfaces/hr';
import { HrService } from '../../../Core/Services/hr';
import { HrStore } from '../../../Store/hr.store';

// Create a vacancy (no `vacancy` input) or rename one. Saves through the store and shows the server's message.
@Component({
  selector: 'app-hr-vacancy-dialog',
  templateUrl: './hr-vacancy-dialog.html',
  styleUrl: './hr-vacancy-dialog.scss',
})
export class HrVacancyDialog implements OnInit, AfterViewInit {
  private hrStore = inject(HrStore);
  private hrService = inject(HrService);

  vacancy = input<HrVacancy | null>(null);
  saved = output<HrVacancy>();
  cancel = output<void>();

  title = signal('');
  saving = signal(false);
  error = signal('');

  private input = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  ngOnInit() {
    this.title.set(this.vacancy()?.title ?? '');
  }

  ngAfterViewInit() {
    const el = this.input()?.nativeElement;
    el?.focus();
    el?.select();
  }

  async save() {
    const title = this.title().replace(/\s+/g, ' ').trim();
    if (!title || this.saving()) return;
    const current = this.vacancy();
    if (current && current.title === title) {
      this.cancel.emit();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const vacancy = current
        ? await this.hrStore.updateVacancy(current.id, { title })
        : await this.hrStore.createVacancy(title);
      this.saved.emit(vacancy);
    } catch (err) {
      this.error.set(this.hrService.errorMessage(err, 'ვაკანსიის შენახვა ვერ მოხერხდა'));
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

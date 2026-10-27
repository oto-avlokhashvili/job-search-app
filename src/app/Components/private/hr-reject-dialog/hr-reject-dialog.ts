import { AfterViewInit, Component, computed, ElementRef, input, OnInit, output, signal, viewChild } from '@angular/core';
import { REJECTION_REASONS } from '../../../Core/Utils/pipeline';

const OTHER = 'other';

// Asked when a candidate is moved to "Rejected" (or its reason is edited). The reason is optional.
// Escape is handled by the page, which knows whether this or the side panel is on top.
@Component({
  selector: 'app-hr-reject-dialog',
  templateUrl: './hr-reject-dialog.html',
  styleUrl: './hr-reject-dialog.scss',
})
export class HrRejectDialog implements OnInit, AfterViewInit {
  candidateName = input('');
  initialReason = input<string | null>(null);
  confirm = output<string | null>();
  cancel = output<void>();

  reasons = REJECTION_REASONS;
  other = OTHER;
  choice = signal<string>('');
  otherText = signal('');
  reason = computed(() => (this.choice() === OTHER ? this.otherText().trim() : this.choice()) || null);

  private dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  ngOnInit() {
    const initial = this.initialReason();
    if (!initial) return;
    if (this.reasons.includes(initial)) {
      this.choice.set(initial);
    } else {
      this.choice.set(OTHER);
      this.otherText.set(initial);
    }
  }

  ngAfterViewInit() {
    this.dialog()?.nativeElement.focus();
  }
}

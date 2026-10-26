import { Component, inject } from '@angular/core';
import { StateStore } from '../../../Store/state.store';

// Shown to HR accounts until an admin approves them (hrGuard sends them here).
@Component({
  selector: 'app-hr-pending',
  templateUrl: './hr-pending.html',
  styleUrl: './hr-pending.scss',
})
export class HrPending {
  stateStore = inject(StateStore);
}

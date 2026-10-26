import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HrService } from '../../../Core/Services/hr';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { HrCandidate } from '../../../Core/Interfaces/hr';
import { HrStore } from '../../../Store/hr.store';
import { HrCandidateCard } from '../hr-candidate-card/hr-candidate-card';

// Candidates whose contacts this HR has opened, newest first. Loaded once into HrStore;
// unlocking on the search page adds to it there.
@Component({
  selector: 'app-hr-candidates',
  imports: [RouterLink, HrCandidateCard],
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

  ngOnInit() {
    this.hrStore.loadUnlocked();
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
}

import { Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HrCandidate } from '../../../Core/Interfaces/hr';

// One CV in HR search/candidate lists: anonymized until unlocked, then contacts + download.
@Component({
  selector: 'app-hr-candidate-card',
  imports: [DatePipe],
  templateUrl: './hr-candidate-card.html',
  styleUrl: './hr-candidate-card.scss',
})
export class HrCandidateCard {
  candidate = input.required<HrCandidate>();
  busy = input(false);
  unlock = output<HrCandidate>();
  download = output<HrCandidate>();

  matched = computed(() => new Set(this.candidate().matchedKeywords ?? []));
  skills = computed(() => {
    const c = this.candidate();
    return [...c.primarySkills, ...c.secondarySkills].slice(0, 12);
  });
  location = computed(() => {
    const pref = this.candidate().locationPreference;
    return pref && pref.toLowerCase() !== 'not specified' ? pref : '';
  });

  isMatched(skill: string): boolean {
    const s = skill.toLowerCase();
    return [...this.matched()].some((k) => s.includes(k) || k.includes(s));
  }
}

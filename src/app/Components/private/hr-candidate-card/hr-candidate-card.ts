import { Component, computed, inject, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HrCandidate } from '../../../Core/Interfaces/hr';
import { STAGE_BY_ID } from '../../../Core/Utils/pipeline';
import { HrStore } from '../../../Store/hr.store';
import { HrVacancyPicker } from '../hr-vacancy-picker/hr-vacancy-picker';

// One CV in HR search/candidate lists: anonymized until unlocked, then contacts + download.
// With `addable` (search page) the main action is adding the CV to a vacancy, which also opens the contacts.
@Component({
  selector: 'app-hr-candidate-card',
  imports: [DatePipe, RouterLink, HrVacancyPicker],
  templateUrl: './hr-candidate-card.html',
  styleUrl: './hr-candidate-card.scss',
})
export class HrCandidateCard {
  private hrStore = inject(HrStore);

  candidate = input.required<HrCandidate>();
  busy = input(false);
  addable = input(false);
  unlock = output<HrCandidate>();
  download = output<HrCandidate>();
  addToVacancy = output<number>();

  matched = computed(() => new Set(this.candidate().matchedKeywords ?? []));
  skills = computed(() => {
    const c = this.candidate();
    return [...c.primarySkills, ...c.secondarySkills].slice(0, 12);
  });
  location = computed(() => {
    const pref = this.candidate().locationPreference;
    return pref && pref.toLowerCase() !== 'not specified' ? pref : '';
  });
  // Vacancies the CV is already in, with its stage there; links to that board
  memberships = computed(() => {
    const titles = new Map(this.hrStore.vacancies().map((v) => [v.id, v.title]));
    return (this.candidate().vacancies ?? [])
      .filter((m) => titles.has(m.vacancyId))
      .map((m) => ({ ...m, title: titles.get(m.vacancyId)!, stage: STAGE_BY_ID[m.stage] }));
  });

  isMatched(skill: string): boolean {
    const s = skill.toLowerCase();
    return [...this.matched()].some((k) => s.includes(k) || k.includes(s));
  }
}

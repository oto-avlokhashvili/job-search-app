import { Component, computed, inject, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HrCandidate } from '../../../Core/Interfaces/hr';
import { STAGE_BY_ID } from '../../../Core/Utils/pipeline';
import { HrStore } from '../../../Store/hr.store';
import { HrVacancyPicker } from '../hr-vacancy-picker/hr-vacancy-picker';

/** Short Georgian names for the languages the CV analysis reports (in English) */
const LANGUAGE_LABELS: Record<string, string> = {
  georgian: 'ქართ.',
  english: 'ინგლ.',
  russian: 'რუს.',
  german: 'გერმ.',
  french: 'ფრანგ.',
  spanish: 'ესპ.',
  italian: 'იტალ.',
  turkish: 'თურქ.',
  ukrainian: 'უკრ.',
  armenian: 'სომხ.',
  azerbaijani: 'აზერ.',
  arabic: 'არაბ.',
  chinese: 'ჩინ.',
  japanese: 'იაპ.',
  korean: 'კორ.',
  polish: 'პოლ.',
  greek: 'ბერძ.',
  hebrew: 'ებრ.',
  persian: 'სპარს.',
  portuguese: 'პორტ.',
};

// Unlocked candidates get a coloured monogram; the colour follows the name, so it stays the same
const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];

/** Skills shown before "+N" */
const VISIBLE_SKILLS = 7;

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

  /** Skills the search asked for come first and are marked; the rest follow, then "+N" */
  private allSkills = computed(() => {
    const c = this.candidate();
    const unique = Array.from(new Set([...c.primarySkills, ...c.secondarySkills]));
    const hits = unique.filter((s) => this.isMatched(s));
    return [...hits, ...unique.filter((s) => !this.isMatched(s))];
  });
  skills = computed(() => this.allSkills().slice(0, VISIBLE_SKILLS));
  hiddenSkills = computed(() => Math.max(0, this.allSkills().length - VISIBLE_SKILLS));

  location = computed(() => {
    const pref = this.candidate().locationPreference;
    return pref && pref.toLowerCase() !== 'not specified' ? pref : '';
  });

  /** "6 წლის გამოცდილება"; empty until the CV is re-analyzed */
  experience = computed(() => {
    const years = this.candidate().yearsOfExperience;
    if (typeof years !== 'number') return '';
    if (years <= 0) return 'გამოცდილების გარეშე';
    return `${years} წლის გამოცდილება`;
  });

  languages = computed(() =>
    (this.candidate().languages ?? []).map((l) => LANGUAGE_LABELS[l.trim().toLowerCase()] ?? l).slice(0, 4),
  );
  hasFacts = computed(() => {
    const c = this.candidate();
    return !!(c.companies?.length || c.universities?.length || c.languages?.length || c.domains.length);
  });

  /** Match colour band: strong (75+), fair (50+), weak */
  tier = computed(() => {
    const m = this.candidate().match;
    if (m === undefined || m === null) return '';
    return m >= 75 ? 'tier-high' : m >= 50 ? 'tier-mid' : 'tier-low';
  });

  name = computed(() => (this.candidate().unlocked ? this.candidate().contact?.fullName?.trim() || '' : ''));
  initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join(''),
  );
  avatarColor = computed(() => {
    const key = this.name() || String(this.candidate().id);
    let hash = 0;
    for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  });

  /** "დღეს", "გუშინ", "3 დღის წინ", "2 კვირის წინ"; older ones as a date */
  updated = computed(() => {
    const date = new Date(this.candidate().updatedAt);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const days = Math.round(
      (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) / 86_400_000,
    );
    if (days <= 0) return 'დღეს';
    if (days === 1) return 'გუშინ';
    if (days < 7) return `${days} დღის წინ`;
    if (days < 35) return `${Math.floor(days / 7)} კვირის წინ`;
    return '';
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

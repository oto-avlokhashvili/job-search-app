import { isPlatformBrowser } from '@angular/common';
import { Component, computed, DestroyRef, inject, input, PLATFORM_ID, signal } from '@angular/core';

/**
 * What the search is doing while it loads, one step at a time. Every step is something that really
 * happens: the vacancies come from these portals, the AI reads sentences and CVs, results are ranked.
 */
const STEPS: Record<'keyword' | 'cv', { icon: string; text: string }[]> = {
  keyword: [
    { icon: 'psychology', text: 'AI კითხულობს შენს მოთხოვნას…' },
    { icon: 'travel_explore', text: 'ვეძებთ ვაკანსიებს hr.ge, jobs.ge, myjobs.ge, awork.ge და LinkedIn-იდან…' },
    { icon: 'filter_alt', text: 'ვფილტრავთ ქალაქით, სფეროთი და ვადით…' },
    { icon: 'sort', text: 'ვალაგებთ საუკეთესო შედეგებს…' },
  ],
  cv: [
    { icon: 'description', text: 'AI აანალიზებს შენს CV-ს…' },
    { icon: 'travel_explore', text: 'ვამოწმებთ ვაკანსიებს hr.ge, jobs.ge, myjobs.ge, awork.ge და LinkedIn-იდან…' },
    { icon: 'compare_arrows', text: 'ვადარებთ უნარებს, გამოცდილებას და პოზიციას…' },
    { icon: 'sort', text: 'ვარჩევთ ყველაზე შესაბამის ვაკანსიებს…' },
  ],
};
const STEP_MS = 1100;

@Component({
  selector: 'app-ai-search-steps',
  standalone: true,
  templateUrl: './ai-search-steps.html',
  styleUrl: './ai-search-steps.scss',
})
export class AiSearchSteps {
  readonly mode = input<'keyword' | 'cv'>('keyword');
  protected steps = computed(() => STEPS[this.mode()]);
  /** The step in progress; the ones before it are done. Stays on the last until the results arrive. */
  protected current = signal(0);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const timer = setInterval(() => this.current.update((i) => Math.min(i + 1, this.steps().length - 1)), STEP_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}

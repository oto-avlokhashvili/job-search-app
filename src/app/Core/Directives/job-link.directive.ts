import { computed, Directive, inject, input } from '@angular/core';
import { JOB_MODAL_PARAM, JobModalService } from '../Services/job-modal.service';

/**
 * A link that opens a vacancy in the modal over the current page: `<a [appJobLink]="job.id">`.
 * A real href, so ctrl/middle-click opens it in a new tab (over the home page); nofollow, because
 * vacancies are search results, not pages for search engines.
 */
@Directive({
  selector: 'a[appJobLink]',
  standalone: true,
  host: {
    '[attr.href]': 'href()',
    rel: 'nofollow',
    '(click)': 'onClick($event)',
  },
})
export class JobLink {
  readonly appJobLink = input.required<number | string>();
  private modal = inject(JobModalService);

  protected href = computed(() => `/home?${JOB_MODAL_PARAM}=${encodeURIComponent(String(this.appJobLink()))}`);

  protected onClick(event: MouseEvent) {
    // New tab / window: let the browser follow the href
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    this.modal.open(this.appJobLink());
  }
}

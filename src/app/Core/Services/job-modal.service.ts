import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { VacancyDetails } from '../../Components/public/vacancy-details/vacancy-details';

/** ?job=123 on any page opens that vacancy in a modal over it. */
export const JOB_MODAL_PARAM = 'job';

export interface JobModalData {
  jobId: string;
}

/**
 * Vacancies have no pages of their own: they open in a modal over the page the visitor is on,
 * and the URL carries ?job=<id> so the modal can be shared and survives a reload. Browser only,
 * so search engines never see vacancy content.
 */
@Injectable({ providedIn: 'root' })
export class JobModalService {
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private ref: MatDialogRef<VacancyDetails> | null = null;
  private openId: string | null = null;

  /** Called once by the app shell: follows the URL from then on. */
  init() {
    if (!this.isBrowser) return;
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.sync());
  }

  /** Opens a vacancy over the current page. */
  open(jobId: number | string) {
    // The URL is the source of truth: sync() opens the modal once it changes
    void this.router.navigate([], {
      queryParams: { [JOB_MODAL_PARAM]: String(jobId) },
      queryParamsHandling: 'merge',
      replaceUrl: true,
      scroll: 'manual',
    });
  }

  private sync() {
    const id = this.router.parseUrl(this.router.url).queryParamMap.get(JOB_MODAL_PARAM);
    const valid = id && /^\d+$/.test(id) ? id : null;
    if (valid === this.openId) return;

    this.ref?.close('navigated');
    if (valid) this.show(valid);
  }

  private show(jobId: string) {
    this.openId = jobId;
    const ref = this.dialog.open<VacancyDetails, JobModalData>(VacancyDetails, {
      data: { jobId },
      width: '820px',
      maxWidth: '96vw',
      panelClass: ['public-cv-dialog', 'job-details-dialog'],
      autoFocus: false,
      // The URL drives it: navigating elsewhere goes through sync()
      closeOnNavigation: false,
    });
    this.ref = ref;

    ref.afterClosed().subscribe((reason) => {
      if (this.ref !== ref) return; // replaced by another vacancy
      this.ref = null;
      this.openId = null;
      // Closed by the visitor (X, backdrop, Esc, apply): take ?job off the URL, staying where they were
      if (reason !== 'navigated') {
        void this.router.navigate([], {
          queryParams: { [JOB_MODAL_PARAM]: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
          scroll: 'manual',
        });
      }
    });
  }
}

import { NgClass } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { Job, VacancyItem } from '../../../Core/Interfaces/jobs';
import { JobLink } from '../../../Core/Directives/job-link.directive';
import { CompanyLogos } from '../../../Core/Utils/company-logos';
import { deadlineStatus, SOURCE_ICONS, sourceLabel } from '../../../Core/Utils/deadline-status';
import { extractSalary, hasSalary } from '../../../Core/Utils/salary-extractor';
import { detectJobSource, formatJobDate, JOBUP_LOGO, JOBUP_SOURCE } from '../../../Store/state.store';
import { FavoriteButton } from '../favorite-button/favorite-button';

/** An API vacancy as a card shows it */
export function toVacancyItem(job: Job & { match?: number }): VacancyItem {
  return {
    id: job.id,
    vacancy: job.vacancy,
    company: job.company,
    location: job.location || 'Remote',
    source: detectJobSource(job.source || '', job.link || '', job.company),
    salaryRange: extractSalary(job),
    publishDate: formatJobDate(job.publishDate),
    deadline: job.deadline ? formatJobDate(job.deadline) : '',
    matchScore: job.match ?? 0,
    link: job.link || '/jobs',
    companyLogo: job.companyLogo ?? null,
    companyKey: job.companyKey ?? null,
  };
}

/**
 * One vacancy as a card: logo, title, company and city, salary, source and the deadline bar.
 * The vacancies page's card, shared with the home page's search results. Opens the vacancy modal.
 */
@Component({
  selector: 'app-vacancy-card',
  standalone: true,
  imports: [NgClass, JobLink, FavoriteButton],
  templateUrl: './vacancy-card.html',
  styleUrl: './vacancy-card.scss',
})
export class VacancyCard {
  readonly job = input.required<VacancyItem>();
  /** One per page, so a broken logo is retried only once */
  readonly logos = input.required<CompanyLogos>();
  /** CV search: how well the vacancy matches the CV, in % (none shown when null) */
  readonly match = input<number | null>(null);

  protected readonly jobUpSource = JOBUP_SOURCE;
  protected readonly jobUpLogo = JOBUP_LOGO;
  protected readonly sourceIcons = SOURCE_ICONS;
  protected readonly sourceLabel = sourceLabel;
  protected readonly hasSalary = hasSalary;
  protected status = computed(() => deadlineStatus(this.job().deadline, this.job().publishDate));
}

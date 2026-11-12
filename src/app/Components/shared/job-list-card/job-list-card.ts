import { Component, input } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Job } from '../../../Core/Interfaces/jobs';
import { brandIcon, CompanyLogos } from '../../../Core/Utils/company-logos';
import { extractSalary } from '../../../Core/Utils/salary-extractor';
import { generateJobSlug } from '../../../Core/Utils/slug-generator';
import { detectJobSource, formatJobDate, JOBUP_LOGO, JOBUP_SOURCE } from '../../../Store/state.store';
import { FavoriteButton } from '../favorite-button/favorite-button';

export interface JobCardItem {
  id: number;
  vacancy: string;
  company: string;
  location: string;
  source: string;
  salaryRange?: string;
  deadline: string;
  slug: string;
  companyLogo: string | null;
}

export function toJobCardItem(job: Job): JobCardItem {
  return {
    id: job.id,
    vacancy: job.vacancy,
    company: job.company,
    location: job.location || 'Remote',
    source: detectJobSource(job.source || '', job.link || '', job.company),
    salaryRange: extractSalary(job),
    deadline: job.deadline ? formatJobDate(job.deadline) : '',
    slug: generateJobSlug(job.vacancy, job.company, job.id),
    companyLogo: brandIcon(job.companyKey) || job.companyLogo || null,
  };
}

/** One vacancy as a full-width row (favorites, company pages), with a save button. */
@Component({
  selector: 'app-job-list-card',
  standalone: true,
  imports: [RouterModule, FavoriteButton],
  templateUrl: './job-list-card.html',
  styleUrl: './job-list-card.scss',
})
export class JobListCard {
  job = input.required<JobCardItem>();
  /** One per page, so a broken logo is retried only once */
  logos = input.required<CompanyLogos>();
  /** Hidden on a company's own page, where every row is that company */
  showCompany = input(true);

  jobUpSource = JOBUP_SOURCE;
  jobUpLogo = JOBUP_LOGO;
}

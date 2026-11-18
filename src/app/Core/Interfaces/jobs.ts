export interface JobCounts {
  totalRecords: number;
  filteredRecords: number;
  jobsGe: number;
  hrGe: number;
  aworkGe: number;
  myjobsGe: number;
  linkedin?: number;
  linkedIn?: number;
  linkedinCom?: number;
  [key: string]: any;
}

export interface JobsResponse {
  jobs: Job[];
  counts: JobCounts;
}

/** What the AI understood from a sentence typed into the search ('' = nothing for that part). */
export interface SearchIntent {
  keywords: string;
  city: string;
  category: string;
}

export interface SearchResponse extends JobsResponse {
  /** null when the search was short enough to use as keywords as-is */
  interpreted?: SearchIntent | null;
}
export interface Job {
  id: number;
  matchId?: number;
  vacancy: string;
  location: string;
  company: string;
  link: string;
  publishDate: string; // or Date if you plan to parse it
  deadline: string;    // or Date
  page?: number;
  salaryRange?: string;
  match?: number;
  description?: string;
  requirements?: string;
  source?: string;
  category?: string;
  /** Company logo (128px WebP on logos.jobup.ge), when the company has one */
  companyLogo?: string | null;
  /** Normalized company name shared by all its vacancies; links to /companies/:key */
  companyKey?: string | null;
  /**
   * The address the vacancy asks CVs to be sent to: quick apply is available.
   * '' = no address (apply on `link`); null/missing = not worked out yet on the API.
   */
  applyEmail?: string | null;
}

export interface AiMatchedJobsResponse {
  data: Job[];
  total: number;
  page: number;
  lastPage: number;
}

export interface SentJob {
  id: number;
  userId: number;
  jobId: number;
  vacancy: string;
  location: string;
  company: string;
  match: number; // percentage (0–100)
  salaryRange: string;
}

export interface SentJobsResponse {
  sentJobs: SentJob[];
  total: number;
  page: number;
  lastPage: number;
}

export interface VacancyItem {
  id: number;
  vacancy: string;
  company: string;
  location: string;
  source: string;
  salaryRange?: string;
  publishDate: string;
  deadline?: string;
  matchScore: number;
  link: string;
  companyLogo?: string | null;
  companyKey?: string | null;
}


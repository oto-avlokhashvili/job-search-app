export interface JobsResponse {
  jobs: Job[];
  count: number;
}
export interface Job {
  id: number;
  vacancy: string;
  company: string;
  link: string;
  publishDate: string; // or Date if you plan to parse it
  deadline: string;    // or Date
  page: number;
}

export interface SentJob {
  id: number;
  userId: number;
  jobId: number;
  job: Job;
}

export interface SentJobsResponse {
  sentJobs: SentJob[];
  count: number;
  page: number;
  totalPages: number;
}

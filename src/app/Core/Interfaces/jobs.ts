export interface JobsResponse {
  jobs: Job[];
  counts: any;
}
export interface Job {
  id: number;
  matchId?:number;
  vacancy: string;
  location:string;
  company: string;
  link: string;
  publishDate: string; // or Date if you plan to parse it
  deadline: string;    // or Date
  page?: number;
  salaryRange?: string;
  match?:number;
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

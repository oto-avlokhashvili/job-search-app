import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { JobsResponse, SentJobsResponse } from '../Interfaces/jobs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class JobsService {
  http = inject(HttpClient);
  url = environment.apiUrl;
  async getJobs():Promise<JobsResponse> {
    const jobs$ = this.http.get<JobsResponse>(this.url + "/job/all")
    const jobs = await firstValueFrom(jobs$);
    return jobs;
  }
  async getUserMatchedJobs(
  id: number,
  page: number = 1,
  pageSize: number = 10
): Promise<SentJobsResponse> {
  const url = `${this.url}/sent-jobs/${id}?page=${page}&pageSize=${pageSize}`;

  const jobs$ = this.http.get<SentJobsResponse>(url);
  const jobs = await firstValueFrom(jobs$);

  return jobs;
}

}

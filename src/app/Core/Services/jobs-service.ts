import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { Job, JobsResponse, SentJobsResponse } from '../Interfaces/jobs';
import { environment } from '../../../environments/environment';
import { skipLoading } from '../loading/skip-loading.component';

@Injectable({
  providedIn: 'root',
})
export class JobsService {
  http = inject(HttpClient);
  url = environment.apiUrl;
getJobs( query: string = '', page: number = 1): Observable<JobsResponse> {
  let params = new HttpParams();

  if (query.trim().length > 0) {
    params = params.set('query', query.trim());
  }

  return this.http.get<JobsResponse>(this.url + `/job/all?page=${page}`, {params});
}

  getUserSentJobs(page: number = 1, limit: number = 10): Observable<SentJobsResponse> {
    return this.http.get<SentJobsResponse>(`${this.url}/sent-jobs?page=${page}&limit=${limit}`);
  }
  findByQuery(queries: string[] = []): Observable<Job[]> {
    let params = new HttpParams();

    queries.forEach(q => {
      params = params.append('query', q);
    });

    return this.http.get<Job[]>(`${this.url}/job/search`, { params });
  }

  analyzeJob(job: any): Observable<any> {
    return this.http.post<any>(`${this.url}/ai/generate`, job);
  }
}

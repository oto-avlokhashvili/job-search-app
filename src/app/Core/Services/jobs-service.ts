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
  getJobs(
    query: string = '',
    page: number = 1,
    source: string = 'all',
    location: string = 'all',
    company: string = '',
    publishDate: string = 'all',
    limit: number = 10
  ): Observable<JobsResponse> {
    let params = new HttpParams();

    if (query.trim().length > 0) {
      params = params.set('query', query.trim());
    }
    if (source && source !== 'all') {
      params = params.set('source', source);
    }
    if (company.trim().length > 0) {
      params = params.set('company', company.trim());
    }
    if (location && location !== 'all') {
      params = params.set('location', location);
    }
    if (publishDate && publishDate !== 'all') {
      params = params.set('publishDate', publishDate);
    }
    params = params.set('limit', limit.toString());

    return this.http.get<JobsResponse>(this.url + `/job/all?page=${page}`, { params, context: new HttpContext().set(skipLoading, true) });
  }

  getUserSentJobs(page: number = 1, limit: number = 10): Observable<SentJobsResponse> {
    return this.http.get<SentJobsResponse>(`${this.url}/sent-jobs?page=${page}&limit=${limit}`);
  }

  getJobById(id: number | string): Observable<Job> {
    return this.http.get<Job>(`${this.url}/job/${id}`, { context: new HttpContext().set(skipLoading, true) });
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

  markAsSentBulk(jobs: any[]): Observable<any> {
    return this.http.post<any>(`${this.url}/sent-jobs/bulk`, jobs, { context: new HttpContext().set(skipLoading, true) });
  }

  getCities(search?: string): Observable<{ location: string; count: number }[]> {
    let params = new HttpParams();
    if (search && search.trim().length > 0) {
      params = params.set('search', search.trim());
    }
    return this.http.get<{ location: string; count: number }[]>(`${this.url}/job/cities`, { params });
  }
}

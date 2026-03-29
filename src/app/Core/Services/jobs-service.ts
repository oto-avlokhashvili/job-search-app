import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { Job, JobsResponse, SentJobsResponse } from '../Interfaces/jobs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class JobsService {
  http = inject(HttpClient);
  url = environment.apiUrl;
  getJobs(vacancy: string[] = [], page: number = 1): Observable<JobsResponse> {
    let params = new HttpParams();

    vacancy?.forEach(q => {
      params = params.append('query', q);
    });
    return this.http.get<JobsResponse>(this.url + `/job/all?page=${page}`, { params })
  }
  getUserMatchedJobs(id: number, page: number = 1, pageSize: number = 10): Observable<SentJobsResponse> {
    return this.http.get<SentJobsResponse>(`${this.url}/sent-jobs/${id}?page=${page}&pageSize=${pageSize}`);
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

import { HttpClient, HttpParams } from '@angular/common/http';
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
  getJobs():Observable<JobsResponse> {
    return this.http.get<JobsResponse>(this.url + "/job/all")
  }
  getUserMatchedJobs(id: number,page: number = 1,pageSize: number = 10): Observable<SentJobsResponse> {
    return this.http.get<SentJobsResponse>(`${this.url}/sent-jobs/${id}?page=${page}&pageSize=${pageSize}`);
  }
  findByQuery(queries: string[] = []): Observable<Job[]> {
  let params = new HttpParams();
    
  queries.forEach(q => {
    params = params.append('query', q);
  });

  return this.http.get<Job[]>(`${this.url}/job/search`, { params });
}
}

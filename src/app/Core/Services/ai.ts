import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { AiMatchedJobsResponse, Job, JobsResponse } from '../Interfaces/jobs';
import { skipLoading } from '../loading/skip-loading.component';

@Injectable({
  providedIn: 'root',
})
export class Ai {
  http = inject(HttpClient);
  url = environment.apiUrl;
  askChat(message: string, history: { role: 'user' | 'model'; text: string }[] = []): Observable<any> {
    return this.http.post<any>(
      `${this.url}/ai/chat`,
      { prompt: message, history },
      { context: new HttpContext().set(skipLoading, true) }
    );
  }
  searchJobsWithAi() {
    return this.http.post<any>(`${this.url}/ai/search-job`, null, { context: new HttpContext().set(skipLoading, true) });
  }

  getAiMatchedJobs(page: number = 1, limit: number = 5): Observable<AiMatchedJobsResponse> {
    return this.http.get<AiMatchedJobsResponse>(`${this.url}/ai-matched-jobs?page=${page}&limit=${limit}`);
  }
}

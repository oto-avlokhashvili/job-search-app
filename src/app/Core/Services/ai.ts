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
  analyzeCvAndJobs(): Observable<any> {
    return this.http.post<any>(`${this.url}/ai/ai-cv-analyzer`, null);
  }
  chat(message: string, files: File[], history: any[], useStoredCv: boolean = false): Observable<any> {
    const token = sessionStorage.getItem('ACCESS_TOKEN');

    const formData = new FormData();
    formData.append('prompt', message);
    formData.append('history', JSON.stringify(history));
    if (useStoredCv) {
      formData.append('useStoredCv', 'true');
    }

    files.forEach(file => {
      formData.append('files', file);
    });

    return this.http.post(`${environment.apiUrl}/ai/chat`, formData, {context: new HttpContext().set(skipLoading, true)});
  }

    getAiMatchedJobs(page: number = 1, limit: number = 5): Observable<AiMatchedJobsResponse> {
      return this.http.get<AiMatchedJobsResponse>(`${this.url}/ai-matched-jobs?page=${page}&limit=${limit}`);
    }
}

import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { Job } from '../Interfaces/jobs';
import { skipLoading } from '../loading/skip-loading.component';

@Injectable({
  providedIn: 'root',
})
export class Ai {
  http = inject(HttpClient);
  url = environment.apiUrl;
  analyzeCvAndJobs(): Observable<Job[]> {
    return this.http.post<Job[]>(`${this.url}/ai/ai-cv-analyzer`, null);
  }
  chat(message: string, files: File[], history: any[]): Observable<any> {
    const token = sessionStorage.getItem('ACCESS_TOKEN');

    const formData = new FormData();
    formData.append('prompt', message);
    formData.append('history', JSON.stringify(history));

    files.forEach(file => {
      formData.append('files', file);
    });

    return this.http.post(`${environment.apiUrl}/ai/chat`, formData, {context: new HttpContext().set(skipLoading, true)});
  }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { Job } from '../Interfaces/jobs';

@Injectable({
  providedIn: 'root',
})
export class Ai {
  http = inject(HttpClient);
  url = environment.apiUrl;
  analyzeCvAndJobs(): Observable<Job[]> {
    return this.http.post<Job[]>(`${this.url}/ai/ai-cv-analyzer`, null);
  }
}

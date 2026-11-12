import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { skipLoading } from '../loading/skip-loading.component';

export interface QuickApplyRequest {
  /** Store the CV, send it to this employer and show it to HRs. Must be true. */
  consent: boolean;
  /** Required without an account; signed in, it replaces the stored CV */
  file?: File | null;
  /** Without an account; the API reads it from the CV when left out */
  fullName?: string;
  /** Required without an account; the employer replies here */
  email?: string;
  phoneNumber?: string;
  turnstileToken?: string;
}

export type QuickApplyStatus = 'QUEUED' | 'SENT' | 'FAILED';

export interface QuickApplication {
  id: number;
  jobId: number;
  jobTitle: string;
  company: string;
  jobLink: string;
  toEmail: string;
  status: QuickApplyStatus;
  createdAt: string;
  sentAt: string | null;
}

/** Read from the CV's text by POST /quick-apply/preview */
export interface CvContacts {
  fullName: string | null;
  email: string | null;
  phoneNumber: string | null;
}

export interface QuickApplyResponse {
  application: QuickApplication;
  /** Without an account: unlocks anonymous CV search, like the public CV upload */
  searchToken?: string;
}

/** Quick apply: the API emails the CV to the address the vacancy names (see Job.applyEmail). */
@Injectable({ providedIn: 'root' })
export class QuickApplyService {
  private http = inject(HttpClient);
  private url = environment.apiUrl;

  apply(jobId: number, data: QuickApplyRequest): Observable<QuickApplyResponse> {
    const form = new FormData();
    form.append('consent', String(data.consent));
    if (data.file) form.append('file', data.file);
    if (data.fullName) form.append('fullName', data.fullName);
    if (data.email) form.append('email', data.email);
    if (data.phoneNumber) form.append('phoneNumber', data.phoneNumber);
    if (data.turnstileToken) form.append('turnstileToken', data.turnstileToken);
    return this.http.post<QuickApplyResponse>(`${this.url}/quick-apply/${jobId}`, form, {
      withCredentials: true,
      context: new HttpContext().set(skipLoading, true),
    });
  }

  /** The name, email and phone the CV shows (null when not found). Nothing is stored. */
  preview(file: File): Observable<CvContacts> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<CvContacts>(`${this.url}/quick-apply/preview`, form, {
      context: new HttpContext().set(skipLoading, true),
    });
  }

  /** Which of these jobs the signed-in user already applied to (max 100 ids). */
  applied(jobIds: number[]): Observable<{ jobIds: number[] }> {
    return this.http.get<{ jobIds: number[] }>(`${this.url}/quick-apply/applied`, {
      params: { jobIds: jobIds.slice(0, 100).join(',') },
      withCredentials: true,
      context: new HttpContext().set(skipLoading, true),
    });
  }

  /** The signed-in user's applications, newest first. */
  mine(): Observable<QuickApplication[]> {
    return this.http.get<QuickApplication[]>(`${this.url}/quick-apply/mine`, {
      withCredentials: true,
      context: new HttpContext().set(skipLoading, true),
    });
  }
}

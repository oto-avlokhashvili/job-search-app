import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { skipLoading } from '../loading/skip-loading.component';

export interface PublicCvSubmissionData {
  email: string;
  file: File;
  fullName?: string;
  phoneNumber?: string;
  consent?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class Cv {
  http = inject(HttpClient);
  url = environment.apiUrl;

  upload(file: File, consent: boolean = true): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('consent', String(consent));
    return this.http.post(`${this.url}/cv/upload`, formData, { withCredentials: true, context: new HttpContext().set(skipLoading, true) });
  }

  submitPublicCv(data: PublicCvSubmissionData): Observable<any> {
    const formData = new FormData();
    formData.append('email', data.email);
    formData.append('file', data.file);
    formData.append('consent', String(data.consent !== false));
    if (data.fullName) {
      formData.append('fullName', data.fullName);
    }
    if (data.phoneNumber) {
      formData.append('phoneNumber', data.phoneNumber);
    }
    return this.http.post(`${this.url}/cv/public-submit`, formData, {
      context: new HttpContext().set(skipLoading, true),
    });
  }

  getCV(): Observable<any> {
    return this.http.get(`${this.url}/cv`, { withCredentials: true, context: new HttpContext().set(skipLoading, true) });
  }

  deleteCV(): Observable<any> {
    return this.http.delete(`${this.url}/cv`, { withCredentials: true, context: new HttpContext().set(skipLoading, true) });
  }

  updateSearchQueries(searchQueries: string[]): Observable<any> {
    return this.http.patch(`${this.url}/cv/cv-summary`, { searchQueries }, { withCredentials: true, context: new HttpContext().set(skipLoading, true) });
  }
}

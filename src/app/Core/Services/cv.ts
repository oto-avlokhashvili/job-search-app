import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { skipLoading } from '../loading/skip-loading.component';

@Injectable({
  providedIn: 'root',
})
export class Cv {
  http = inject(HttpClient);
  url = environment.apiUrl;

  upload(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.url}/cv/upload`, formData, { withCredentials: true, context: new HttpContext().set(skipLoading, true) },);
  }

  getCV(): Observable<any> {
    return this.http.get(`${this.url}/cv`, { withCredentials: true, context: new HttpContext().set(skipLoading, true) });
  }

  deleteCV(): Observable<any> {
    return this.http.delete(`${this.url}/cv`, { withCredentials: true, context: new HttpContext().set(skipLoading, true) });
  }
}

import { HttpClient, HttpContext, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { skipLoading } from '../loading/skip-loading.component';
import {
  HrAccount,
  HrCandidate,
  HrCvSearchParams,
  HrCvSearchResult,
  HrUsage,
  LinkedinSearchResult,
} from '../Interfaces/hr';

/**
 * HR candidate search API. Pages show their own spinners, so calls skip the global loader.
 * Results are kept in HrStore.
 */
@Injectable({
  providedIn: 'root',
})
export class HrService {
  private http = inject(HttpClient);
  private url = environment.apiUrl;
  private context = () => new HttpContext().set(skipLoading, true);

  searchCvs(params: HrCvSearchParams): Observable<HrCvSearchResult> {
    return this.http.get<HrCvSearchResult>(`${this.url}/hr/candidates/cvs`, {
      params: this.toParams(params),
      context: this.context(),
    });
  }

  searchLinkedin(params: { keyword: string; location?: string; page?: number }): Observable<LinkedinSearchResult> {
    return this.http.get<LinkedinSearchResult>(`${this.url}/hr/candidates/linkedin`, {
      params: this.toParams(params),
      context: this.context(),
    });
  }

  unlock(cvId: number): Observable<HrCandidate> {
    return this.http.post<HrCandidate>(`${this.url}/hr/candidates/${cvId}/unlock`, null, { context: this.context() });
  }

  listUnlocked(): Observable<HrCandidate[]> {
    return this.http.get<HrCandidate[]>(`${this.url}/hr/candidates/unlocked`, { context: this.context() });
  }

  /** Fetches the CV file and hands it to the browser as a download. */
  async downloadCv(cvId: number, fallbackName = 'cv'): Promise<void> {
    const res = await firstValueFrom(
      this.http.get(`${this.url}/hr/candidates/${cvId}/download`, {
        responseType: 'blob',
        observe: 'response',
        context: this.context(),
      }),
    );
    const disposition = res.headers.get('Content-Disposition') || '';
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
    const fileName = encoded ? decodeURIComponent(encoded) : fallbackName;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(res.body!);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  getUsage(): Observable<HrUsage> {
    return this.http.get<HrUsage>(`${this.url}/hr/usage`, { context: this.context() });
  }

  // Admin: HR account approval
  listHrAccounts(approved?: boolean): Observable<HrAccount[]> {
    const params = approved === undefined ? undefined : new HttpParams().set('approved', String(approved));
    return this.http.get<HrAccount[]>(`${this.url}/user/hr`, { params, context: this.context() });
  }

  setHrApproval(id: number, approved: boolean): Observable<HrAccount> {
    return this.http.patch<HrAccount>(`${this.url}/user/hr/${id}/approval`, { approved }, { context: this.context() });
  }

  /** Server messages are Georgian for quota/limit errors; anything else gets the fallback. */
  errorMessage(err: unknown, fallback: string): string {
    const message = (err as HttpErrorResponse)?.error?.message;
    return typeof message === 'string' && /[Ⴀ-ჿ]/.test(message) ? message : fallback;
  }

  private toParams(params: object): HttpParams {
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') httpParams = httpParams.set(key, String(value));
    }
    return httpParams;
  }
}

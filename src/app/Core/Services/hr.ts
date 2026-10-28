import { HttpClient, HttpContext, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { skipLoading } from '../loading/skip-loading.component';
import {
  BoardCard,
  CandidateActivity,
  HrInterview,
  InterviewAnswer,
  InterviewDraft,
  PublicInterview,
  HrVacancy,
  HrAccount,
  HrCandidate,
  PipelineChange,
  PipelineState,
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

  // Every card of this HR: the boards filter it per vacancy on the client.
  getBoard(): Observable<BoardCard[]> {
    return this.http.get<BoardCard[]>(`${this.url}/hr/board`, { context: this.context() });
  }

  // `order` = entry ids of the card's column after a drop, top to bottom.
  updatePipeline(entryId: number, change: PipelineChange & { order?: number[] }): Observable<PipelineState> {
    return this.http.patch<PipelineState>(`${this.url}/hr/board/${entryId}`, change, { context: this.context() });
  }

  /** Takes a card off its vacancy. Returns the card when it was the CV's last one (it stays without a vacancy). */
  removeFromVacancy(entryId: number): Observable<PipelineState | null> {
    return this.http.delete<PipelineState | null>(`${this.url}/hr/board/${entryId}`, { context: this.context() });
  }

  // Interviews: from the last month on, soonest first
  listInterviews(): Observable<HrInterview[]> {
    return this.http.get<HrInterview[]>(`${this.url}/hr/interviews`, { context: this.context() });
  }

  /** Moves the card to INTERVIEW too; `send: false` saves it without emailing the candidate. */
  scheduleInterview(entryId: number, draft: InterviewDraft & { send: boolean }): Observable<{ interview: HrInterview; pipeline: PipelineState }> {
    return this.http.post<{ interview: HrInterview; pipeline: PipelineState }>(`${this.url}/hr/board/${entryId}/interviews`, draft, {
      context: this.context(),
    });
  }

  updateInterview(
    id: number,
    change: Partial<InterviewDraft> & { acceptProposed?: number; cancel?: boolean; notify?: boolean },
  ): Observable<HrInterview> {
    return this.http.patch<HrInterview>(`${this.url}/hr/interviews/${id}`, change, { context: this.context() });
  }

  // Candidate side (public page, no sign-in)
  getPublicInterview(token: string): Observable<PublicInterview> {
    return this.http.get<PublicInterview>(`${this.url}/interview/${encodeURIComponent(token)}`, { context: this.context() });
  }

  answerInterview(token: string, answer: InterviewAnswer): Observable<PublicInterview> {
    return this.http.post<PublicInterview>(`${this.url}/interview/${encodeURIComponent(token)}/answer`, answer, {
      context: this.context(),
    });
  }

  listVacancies(): Observable<{ vacancies: HrVacancy[]; unassigned: number }> {
    return this.http.get<{ vacancies: HrVacancy[]; unassigned: number }>(`${this.url}/hr/vacancies`, {
      context: this.context(),
    });
  }

  createVacancy(title: string): Observable<HrVacancy> {
    return this.http.post<HrVacancy>(`${this.url}/hr/vacancies`, { title }, { context: this.context() });
  }

  updateVacancy(id: number, change: Partial<Pick<HrVacancy, 'title' | 'status'>>): Observable<HrVacancy> {
    return this.http.patch<HrVacancy>(`${this.url}/hr/vacancies/${id}`, change, { context: this.context() });
  }

  deleteVacancy(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/hr/vacancies/${id}`, { context: this.context() });
  }

  /** Opens the contacts if needed (counts toward the quota once per CV) and adds the CV to the vacancy. */
  addToVacancy(vacancyId: number, cvId: number): Observable<BoardCard> {
    return this.http.post<BoardCard>(`${this.url}/hr/vacancies/${vacancyId}/candidates/${cvId}`, null, {
      context: this.context(),
    });
  }

  getActivity(cvId: number): Observable<CandidateActivity[]> {
    return this.http.get<CandidateActivity[]>(`${this.url}/hr/candidates/${cvId}/activity`, { context: this.context() });
  }

  addNote(cvId: number, body: string): Observable<CandidateActivity> {
    return this.http.post<CandidateActivity>(`${this.url}/hr/candidates/${cvId}/notes`, { body }, { context: this.context() });
  }

  deleteNote(noteId: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/hr/candidates/notes/${noteId}`, { context: this.context() });
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

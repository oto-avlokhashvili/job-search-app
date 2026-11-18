import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { Job, JobsResponse, SearchResponse, SentJobsResponse } from '../Interfaces/jobs';
import { SystemStats } from '../Interfaces/stats';
import { environment } from '../../../environments/environment';
import { skipLoading } from '../loading/skip-loading.component';

@Injectable({
  providedIn: 'root',
})
export class JobsService {
  http = inject(HttpClient);
  url = environment.apiUrl;

  getStats(): Observable<SystemStats> {
    return this.http.get<SystemStats>(`${this.url}/stats`, { context: new HttpContext().set(skipLoading, true) });
  }

  getJobs(
    query: string = '',
    page: number = 1,
    source: string = 'all',
    location: string = 'all',
    company: string = '',
    publishDate: string = 'all',
    limit: number = 10,
    salaryOnly: boolean = false,
    category: string = 'all',
  ): Observable<JobsResponse> {
    let params = new HttpParams();

    if (query.trim().length > 0) {
      params = params.set('query', query.trim());
    }
    if (source && source !== 'all') {
      params = params.set('source', source);
    }
    if (company.trim().length > 0) {
      params = params.set('company', company.trim());
    }
    if (location && location !== 'all') {
      params = params.set('location', location);
    }
    if (publishDate && publishDate !== 'all') {
      params = params.set('publishDate', publishDate);
    }
    if (salaryOnly) {
      params = params.set('salary', 'true');
    }
    if (category && category !== 'all') {
      params = params.set('category', category);
    }
    params = params.set('limit', limit.toString());

    return this.http.get<JobsResponse>(this.url + `/job/all?page=${page}`, { params, context: new HttpContext().set(skipLoading, true) });
  }

  /** Active jobs per category, for the counts in the category filter. */
  getCategoryCounts(): Observable<{ category: string; count: number }[]> {
    return this.http.get<{ category: string; count: number }[]>(`${this.url}/job/categories`, {
      context: new HttpContext().set(skipLoading, true),
    });
  }

  /**
   * The AI search: a sentence ("მინდა ბუღალტრად ვიმუშაო ბათუმში") is read into keywords, city and
   * category on the API; short searches are keywords as-is. Nothing comes back without a query, city,
   * category or salaryOnly, and a search shows at most 60 vacancies.
   */
  search(params: {
    query?: string;
    page?: number;
    limit?: number;
    source?: string;
    location?: string;
    publishDate?: string;
    salaryOnly?: boolean;
    category?: string;
  }): Observable<SearchResponse> {
    let httpParams = new HttpParams().set('page', params.page ?? 1).set('limit', params.limit ?? 10);
    const set = (name: string, value?: string) => {
      if (value && value.trim() && value !== 'all') httpParams = httpParams.set(name, value.trim());
    };
    set('query', params.query);
    set('source', params.source);
    set('location', params.location);
    set('publishDate', params.publishDate);
    set('category', params.category);
    if (params.salaryOnly) httpParams = httpParams.set('salary', 'true');
    return this.http.get<SearchResponse>(`${this.url}/search`, {
      params: httpParams,
      context: new HttpContext().set(skipLoading, true),
    });
  }

  /** What visitors search for most (anonymous, recent, only searches that found vacancies) */
  getPopularSearches(limit = 10): Observable<{ queries: string[] }> {
    return this.http.get<{ queries: string[] }>(`${this.url}/search/popular`, {
      params: new HttpParams().set('limit', limit),
      context: new HttpContext().set(skipLoading, true),
    });
  }

  /** "Open the original": counts the click on the API, which redirects to the source site. */
  clickOutUrl(jobId: number | string): string {
    return `${this.url}/search/go/${encodeURIComponent(String(jobId))}`;
  }

  getUserSentJobs(page: number = 1, limit: number = 10): Observable<SentJobsResponse> {
    return this.http.get<SentJobsResponse>(`${this.url}/sent-jobs?page=${page}&limit=${limit}`);
  }

  getJobById(id: number | string): Observable<Job> {
    return this.http.get<Job>(`${this.url}/job/${id}`, { context: new HttpContext().set(skipLoading, true) });
  }
  findByQuery(queries: string[] = []): Observable<Job[]> {
    let params = new HttpParams();

    queries.forEach(q => {
      params = params.append('query', q);
    });

    return this.http.get<Job[]>(`${this.url}/job/search`, { params });
  }

  analyzeJob(job: any): Observable<any> {
    return this.http.post<any>(`${this.url}/ai/generate`, job);
  }

  markAsSentBulk(jobs: any[]): Observable<any> {
    return this.http.post<any>(`${this.url}/sent-jobs/bulk`, jobs, { context: new HttpContext().set(skipLoading, true) });
  }

  getCities(search?: string): Observable<{ location: string; count: number }[]> {
    let params = new HttpParams();
    if (search && search.trim().length > 0) {
      params = params.set('search', search.trim());
    }
    return this.http.get<{ location: string; count: number }[]>(`${this.url}/job/cities`, { params, context: new HttpContext().set(skipLoading, true) }, );
  }

  syncLinkedin(params?: {
    query?: string;
    keywords?: string;
    location?: string;
    startPage?: number;
    maxPages?: number;
    maxPagesPerRegion?: number;
    delayBetweenRequests?: number;
    fetchDescriptions?: boolean;
    descriptionLimit?: number;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params?.query) httpParams = httpParams.set('query', params.query.trim());
    if (params?.keywords) httpParams = httpParams.set('keywords', params.keywords.trim());
    if (params?.location) httpParams = httpParams.set('location', params.location.trim());
    if (params?.startPage != null) httpParams = httpParams.set('startPage', params.startPage.toString());
    if (params?.maxPages != null) httpParams = httpParams.set('maxPages', params.maxPages.toString());
    if (params?.maxPagesPerRegion != null) httpParams = httpParams.set('maxPagesPerRegion', params.maxPagesPerRegion.toString());
    if (params?.delayBetweenRequests != null) httpParams = httpParams.set('delayBetweenRequests', params.delayBetweenRequests.toString());
    if (params?.fetchDescriptions != null) httpParams = httpParams.set('fetchDescriptions', params.fetchDescriptions.toString());
    if (params?.descriptionLimit != null) httpParams = httpParams.set('descriptionLimit', params.descriptionLimit.toString());

    return this.http.get<any>(`${this.url}/scraper/sync-linkedin`, { params: httpParams });
  }
}

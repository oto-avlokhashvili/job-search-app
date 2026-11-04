import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, effect, inject, Injectable, PLATFORM_ID, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { skipLoading } from '../loading/skip-loading.component';
import { Job } from '../Interfaces/jobs';
import { AuthService } from './auth-service';
import { AlertifyService } from './alertify.service';

/** Guests' saved job ids, newest first. Only ids: job data is always fetched fresh. */
const GUEST_STORAGE_KEY = 'job_favorites';
/** Matches the API's per-request limit, so a guest's whole list can be merged on sign-in. */
const GUEST_LIMIT = 100;

/**
 * Saved vacancies for everyone: signed-in users' favorites live on the account, guests' in
 * this browser. When a guest signs in, their browser list is merged into the account.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private alertify = inject(AlertifyService);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private url = environment.apiUrl;
  private context = () => new HttpContext().set(skipLoading, true);

  private ids = signal<ReadonlySet<number>>(new Set());
  /** Bumped after every (re)load of the ids, e.g. after the sign-in merge; lists reload on it. */
  readonly version = signal(0);
  readonly count = computed(() => this.ids().size);

  constructor() {
    if (!this.isBrowser) return;
    effect(() => {
      const loggedIn = this.authService.isLoggedIn();
      untracked(() => this.sync(loggedIn));
    });
  }

  isFavorite(jobId: number): boolean {
    return this.ids().has(jobId);
  }

  /** Saves or removes a vacancy; the heart updates at once and reverts if the request fails. */
  async toggle(jobId: number): Promise<void> {
    const wasFavorite = this.isFavorite(jobId);

    if (!this.authService.isLoggedIn()) {
      const guest = this.readGuest().filter((id) => id !== jobId);
      if (!wasFavorite && guest.length >= GUEST_LIMIT) {
        this.alertify.warning(`შეგიძლიათ შეინახოთ მაქსიმუმ ${GUEST_LIMIT} ვაკანსია. შედით ანგარიშში მეტისთვის.`);
        return;
      }
      const next = wasFavorite ? guest : [jobId, ...guest];
      this.writeGuest(next);
      this.ids.set(new Set(next));
      return;
    }

    this.setLocal(jobId, !wasFavorite);
    try {
      const req$ = wasFavorite
        ? this.http.delete(`${this.url}/favorites/${jobId}`, { context: this.context() })
        : this.http.put(`${this.url}/favorites/${jobId}`, null, { context: this.context() });
      await firstValueFrom(req$);
    } catch (err: any) {
      this.setLocal(jobId, wasFavorite);
      this.alertify.error(err?.error?.message || 'ვაკანსიის შენახვა ვერ მოხერხდა');
    }
  }

  /** The saved vacancies, newest first. For guests, ids of deleted jobs are dropped as well. */
  async loadSaved(): Promise<Job[]> {
    if (this.authService.isLoggedIn()) {
      return firstValueFrom(this.http.get<Job[]>(`${this.url}/favorites`, { context: this.context() }));
    }

    const guest = this.readGuest();
    if (guest.length === 0) return [];
    const jobs = await firstValueFrom(
      this.http.get<Job[]>(`${this.url}/job/by-ids`, { params: { ids: guest.join(',') }, context: this.context() }),
    );
    const alive = new Set(jobs.map((job) => job.id));
    if (alive.size !== guest.length) {
      const pruned = guest.filter((id) => alive.has(id));
      this.writeGuest(pruned);
      this.ids.set(new Set(pruned));
    }
    return jobs;
  }

  private async sync(loggedIn: boolean) {
    if (!loggedIn) {
      this.ids.set(new Set(this.readGuest()));
      this.version.update((v) => v + 1);
      return;
    }

    const guest = this.readGuest();
    try {
      const ids = await firstValueFrom(
        guest.length
          ? this.http.post<number[]>(`${this.url}/favorites/merge`, { jobIds: guest }, { context: this.context() })
          : this.http.get<number[]>(`${this.url}/favorites/ids`, { context: this.context() }),
      );
      // The browser list now lives on the account
      if (guest.length) this.writeGuest([]);
      this.ids.set(new Set(ids));
    } catch {
      // Keep the guest list for the next attempt; the hearts just start empty
      this.ids.set(new Set());
    }
    this.version.update((v) => v + 1);
  }

  private setLocal(jobId: number, favorite: boolean) {
    this.ids.update((set) => {
      const next = new Set(set);
      if (favorite) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  }

  private readGuest(): number[] {
    if (!this.isBrowser) return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(GUEST_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((id) => Number.isInteger(id) && id > 0) : [];
    } catch {
      return [];
    }
  }

  private writeGuest(ids: number[]) {
    try {
      if (ids.length) localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(ids));
      else localStorage.removeItem(GUEST_STORAGE_KEY);
    } catch {}
  }
}

import { computed, inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type { SavedCvSubmission } from '../../Components/public/public-cv-modal/public-cv-modal';
import { StateStore } from '../../Store/state.store';
import { PUBLIC_CV_STORAGE_KEY } from '../Utils/public-cv-storage';
import { AuthService } from './auth-service';
import { Cv, PublicCvSearchResult } from './cv';

/**
 * CV search, shared by the home hero and the vacancies page: the CV this browser uploaded
 * (anonymous, by search token) or else the signed-in user's account CV.
 */
@Injectable({ providedIn: 'root' })
export class CvSearchService {
  private cvService = inject(Cv);
  private authService = inject(AuthService);
  private stateStore = inject(StateStore);
  private dialog = inject(MatDialog);

  /** The last upload from this browser, as the public CV modal saved it */
  readonly uploadedCv = signal<SavedCvSubmission | null>(null);
  readonly accountCv = computed(() => (this.authService.isLoggedIn() ? this.stateStore.userCv() : null));
  readonly hasCv = computed(() => !!this.uploadedCv() || !!this.accountCv());
  readonly cvFileName = computed(() => this.uploadedCv()?.fileName || this.accountCv()?.originalName || '');

  /** Reads the saved upload again (the modal writes it to localStorage). Browser only. */
  loadUploadedCv() {
    try {
      const stored = localStorage.getItem(PUBLIC_CV_STORAGE_KEY);
      const parsed: SavedCvSubmission | null = stored ? JSON.parse(stored) : null;
      this.uploadedCv.set(parsed?.email ? parsed : null);
    } catch {
      this.uploadedCv.set(null);
    }
  }

  /**
   * Opens the CV upload modal in search mode. Resolves to true when the visitor asked to search
   * (the modal's search button, or a finished upload when `searchAfterUpload`).
   */
  async openUploadModal(options: { reupload?: boolean; searchAfterUpload?: boolean } = {}): Promise<boolean> {
    // Loaded on demand: most visitors never open it
    const { PublicCvModal } = await import('../../Components/public/public-cv-modal/public-cv-modal');
    const ref = this.dialog.open(PublicCvModal, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'public-cv-dialog',
      autoFocus: false,
      data: { mode: 'search', reupload: !!options.reupload },
    });
    const result = await firstValueFrom(ref.afterClosed());
    this.loadUploadedCv();
    return result === 'search' || (result === true && !!options.searchAfterUpload);
  }

  /**
   * The matches for the CV. The browser that uploaded it stays trusted: an upload saved without a
   * token, or whose token was replaced from another device, is reconnected instead of asking for
   * the file again. Errors carry the API's status (410 = the CV is gone, 429 = search limit).
   */
  async search(): Promise<PublicCvSearchResult> {
    const saved = this.uploadedCv();
    if (saved) {
      try {
        const token = saved.searchToken || (await this.reconnect(saved));
        try {
          return await firstValueFrom(this.cvService.searchPublicCv(token));
        } catch (err: any) {
          if (err?.status !== 401 || !saved.searchToken) throw err;
          return await firstValueFrom(this.cvService.searchPublicCv(await this.reconnect(saved)));
        }
      } catch (err: any) {
        // 410 = no such CV in the database any more; fall back to the account CV if there is one
        if (err?.status !== 410) throw err;
        this.dropSavedCv();
        if (!this.accountCv()) throw err;
      }
    }
    return firstValueFrom(this.cvService.searchMyCv());
  }

  /** What to tell the visitor when search() fails; '' when the CV is simply gone (ask for a new one). */
  errorMessage(err: any): string {
    if (err?.status === 410 && !this.hasCv()) return '';
    if (err?.status === 429) {
      const minutes = Math.ceil((err.error?.retryAfter || 3600) / 60);
      return `ძიების ლიმიტი ამოიწურა, სცადეთ ${minutes} წუთში`;
    }
    return err?.error?.message || 'CV-ით ძიება ვერ მოხერხდა, სცადეთ თავიდან';
  }

  dropSavedCv() {
    try {
      localStorage.removeItem(PUBLIC_CV_STORAGE_KEY);
    } catch {}
    this.uploadedCv.set(null);
  }

  /** A fresh search token for the saved upload, stored so this happens only once */
  private async reconnect(saved: SavedCvSubmission): Promise<string> {
    if (!saved.fileName) throw { status: 410 };
    const res = await firstValueFrom(this.cvService.reconnectPublicCv(saved.email, saved.fileName));
    const updated: SavedCvSubmission = { ...saved, searchToken: res.searchToken, searchAvailable: res.searchAvailable };
    try {
      localStorage.setItem(PUBLIC_CV_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
    this.uploadedCv.set(updated);
    return res.searchToken;
  }
}

import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom, Observable, shareReplay, tap } from 'rxjs';
import { User, UserRegistration } from '../Interfaces/user';
import { environment } from '../../../environments/environment';
import { skipLoading } from '../loading/skip-loading.component';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  http = inject(HttpClient);
  url = environment.apiUrl;
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  #tokenSignal = signal<string | null>(null);
  token = this.#tokenSignal.asReadonly();
  isLoggedIn = computed(() => !!this.token());
  
  isAuthModalOpen = signal(false);
  authModalMode = signal<'login' | 'register'>('login');
  returnUrl = signal<string | null>(null);

  openAuthModal(mode: 'login' | 'register' = 'login', returnUrl: string | null = null) {
    this.authModalMode.set(mode);
    this.returnUrl.set(returnUrl);
    this.isAuthModalOpen.set(true);
  }

  closeAuthModal() {
    this.isAuthModalOpen.set(false);
  }

  constructor() {
    if (this.isBrowser) {
      this.loadUserFromStorage();
    }
    effect(() => {
      const token = this.token();
      if (this.isBrowser && token) {
        localStorage.setItem("ACCESS_TOKEN", token);
      }
    });
    effect(() => {
      if (!this.isBrowser) {
        return;
      }
      if (this.isAuthModalOpen()) {
        document.body.classList.add('modal-open');
      } else {
        document.body.classList.remove('modal-open');
      }
    });
  }

  setToken(token: string) {
    this.#tokenSignal.set(token);
    if (this.isBrowser) {
      localStorage.setItem("ACCESS_TOKEN", token);
    }
  }
  loadUserFromStorage() {
    const stored = localStorage.getItem("ACCESS_TOKEN");
    if (!stored) return;
    // The token is stored raw; older sessions saved it JSON-quoted.
    let token: unknown = stored;
    if (stored.startsWith('"')) {
      try {
        token = JSON.parse(stored);
      } catch {}
    }
    if (typeof token === 'string' && token) {
      this.#tokenSignal.set(token);
    } else {
      localStorage.removeItem("ACCESS_TOKEN");
    }
  }
  login(email: string, password: string): Observable<{ token: string }> {
    return this.http.post<{ token: string }>(this.url + "/auth/login", { email, password }, { withCredentials: true }).pipe(
      tap((res: { token: string }) => {
        this.#tokenSignal.set(res.token);
        if (this.isBrowser) {
          localStorage.setItem("ACCESS_TOKEN", res.token);
        }
      })
    )
  }
  userRegistration(obj: UserRegistration): Observable<User> {
    return this.http.post<User>(this.url + "/user", obj, { withCredentials: true })
  }
  // Employer account: same email verification, then waits for admin approval.
  hrRegistration(obj: UserRegistration & { companyName: string }): Observable<User> {
    return this.http.post<User>(this.url + "/user/hr", obj, { withCredentials: true })
  }
  async refreshToken() {
    const refresh$ = this.http.post(this.url + "/auth/refresh", null, {
      withCredentials: true
    })
    const user: any = await firstValueFrom(refresh$);
    this.#tokenSignal.set(user.token);
    if (this.isBrowser) {
      localStorage.setItem("ACCESS_TOKEN", user.token);
    }
    return user;
  }

  // silent: skip the global loading overlay (used for background polling).
  async getUserProfile(silent = false): Promise<any> {
    const context = new HttpContext().set(skipLoading, silent);
    const profile$ = this.http.get(this.url + '/auth/profile', { withCredentials: true, context })
    const profile = firstValueFrom(profile$)
    return profile;
  }

  /* async getUserProfile(){
    const profile$ = this.http.get(this.url+"/auth/profile", { withCredentials: true })
    const profile  = await firstValueFrom(profile$);
    return profile;
  } */




  async logOut() {
    try {
      const message$ = this.http.post(this.url + "/auth/logout", { withCredentials: true });
      await firstValueFrom(message$);
    } catch (err) {
      console.warn("Backend logout failed, clearing local session anyway:", err);
    } finally {
      this.#tokenSignal.set(null);
      if (this.isBrowser) {
        localStorage.removeItem("ACCESS_TOKEN");
      }
    }
  }

  async generateTelegramToken() {
    const telegramToken$ = this.http.get(this.url + "/telegram/generate-link-token", { context: new HttpContext().set(skipLoading, true) })
    const res: any = await firstValueFrom(telegramToken$)
    return res.token;
  }

  async verifyEmail(email: string, code: string): Promise<any> {
    const res$ = this.http.post(this.url + "/user/verify", { email, code }, { context: new HttpContext().set(skipLoading, true) });
    return firstValueFrom(res$);
  }

  async resendVerification(email: string): Promise<any> {
    const res$ = this.http.post(this.url + "/user/resend-verification", { email }, { context: new HttpContext().set(skipLoading, true) });
    return firstValueFrom(res$);
  }
}

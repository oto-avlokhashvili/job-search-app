import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
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
    this.loadUserFromStorage();
    effect(() => {
      const token = this.token();
      if (token) {
        localStorage.setItem("ACCESS_TOKEN", JSON.stringify(token));
      }
    });
    effect(() => {
      if (this.isAuthModalOpen()) {
        document.body.classList.add('modal-open');
      } else {
        document.body.classList.remove('modal-open');
      }
    });
  }

  setToken(token: string) {
    this.#tokenSignal.set(token);
    localStorage.setItem("ACCESS_TOKEN", JSON.stringify(token));
  }
  loadUserFromStorage() {
    const json = localStorage.getItem("ACCESS_TOKEN");
    if (json) {
      const user = JSON.parse(json);
      this.#tokenSignal.set(user);
    }
  }
  login(email: string, password: string): Observable<{ token: string }> {
    return this.http.post<{ token: string }>(this.url + "/auth/login", { email, password }, { withCredentials: true }).pipe(
      tap((res: { token: string }) => {
        this.#tokenSignal.set(res.token);
        localStorage.setItem("ACCESS_TOKEN", res.token);
      })
    )
  }
  userRegistration(obj: UserRegistration): Observable<User> {
    return this.http.post<User>(this.url + "/user", obj, { withCredentials: true })
  }
  async refreshToken() {
    const refresh$ = this.http.post(this.url + "/auth/refresh", null, {
      withCredentials: true
    })
    const user: any = await firstValueFrom(refresh$);
    this.#tokenSignal.set(user.token);
    localStorage.setItem("ACCESS_TOKEN", user.token);
    return user;
  }

  async getUserProfile(): Promise<any> {

    const profile$ = this.http.get(this.url + '/auth/profile', { withCredentials: true })
    const profile = firstValueFrom(profile$)
    return profile;
  }

  /* async getUserProfile(){
    const profile$ = this.http.get(this.url+"/auth/profile", { withCredentials: true })
    const profile  = await firstValueFrom(profile$);
    return profile;
  } */




  async logOut() {
    const message$ = this.http.post(this.url + "/auth/logout", { withCredentials: true })
    const msg = await firstValueFrom(message$);
    this.#tokenSignal.set(null);
    localStorage.removeItem("ACCESS_TOKEN");
    return msg;
  }

  async generateTelegramToken() {
    const telegramToken$ = this.http.get(this.url + "/telegram/generate-link-token")
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

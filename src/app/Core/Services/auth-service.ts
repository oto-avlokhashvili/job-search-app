import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable, shareReplay } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  http = inject(HttpClient);
  url = "http://localhost:3000"
  #tokenSignal = signal<string | null>(null);
  token = this.#tokenSignal.asReadonly();
  isLoggedIn = computed(() => !!this.token());
  constructor() {
    this.loadUserFromStorage();
    effect(() => {
      const token = this.token();
      if (token) {
        sessionStorage.setItem("token", JSON.stringify(token));
      }
    })
  }

  loadUserFromStorage() {
    const json = sessionStorage.getItem("token");
    if (json) {
      const user = JSON.parse(json);
      this.#tokenSignal.set(user);
    }
  }
  async login(email: string, password: string) {
    const login$ = this.http.post(this.url + "/auth/login", { email, password }, { withCredentials: true })
    const user: any = await firstValueFrom(login$);
    this.#tokenSignal.set(user.token);
    sessionStorage.setItem("token", user.token);
    return user;
  }

  async refreshToken() {
    const refresh$ = this.http.post(this.url + "/auth/refresh", null, {
      withCredentials: true
    })
    const user: any = await firstValueFrom(refresh$);
    this.#tokenSignal.set(user.token);
    sessionStorage.setItem("token", user.token);
    return user;
  }
  private profile$?: Observable<any>;

  getUserProfile(): Observable<any> {
    if (!this.profile$) {
      this.profile$ = this.http
        .get(this.url + '/auth/profile', { withCredentials: true })
        .pipe(shareReplay(1));
    }
    return this.profile$;
  }

  /* async getUserProfile(){
    const profile$ = this.http.get(this.url+"/auth/profile", { withCredentials: true })
    const profile  = await firstValueFrom(profile$);
    return profile;
  } */

  async logOut() {
    const message$ = this.http.get(this.url + "/auth/logout", { withCredentials: true })
    const msg = await firstValueFrom(message$);
    this.#tokenSignal.set(null);
    sessionStorage.removeItem("token");
    return msg;
  }
}

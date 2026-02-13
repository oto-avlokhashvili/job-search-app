import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable, shareReplay, tap } from 'rxjs';
import { User, UserRegistration } from '../Interfaces/user';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  http = inject(HttpClient);
  url = environment.apiUrl;
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
  login(email: string, password: string):Observable<{token:string}> {
    return this.http.post<{token:string}>(this.url + "/auth/login", { email, password }, { withCredentials: true }).pipe(
      tap((res:{token:string}) => {
        this.#tokenSignal.set(res.token);
        sessionStorage.setItem("token", res.token);
      })
    )
  }
  userRegistration(obj: UserRegistration):Observable<User>{
    return this.http.post<User>(this.url + "/user", obj, { withCredentials: true })
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
    const message$ = this.http.get(this.url + "/auth/logout", { withCredentials: true })
    const msg = await firstValueFrom(message$);
    this.#tokenSignal.set(null);
    sessionStorage.removeItem("token");
    return msg;
  }

  async generateTelegramToken(){
    const telegramToken$ = this.http.get(this.url + "/telegram/generate-link-token")
    const res:any = await firstValueFrom(telegramToken$)
    return res.token;
  }
}

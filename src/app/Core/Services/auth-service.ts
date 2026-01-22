import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  http = inject(HttpClient);
  url = "http://localhost:3000"
  #tokenSignal = signal<string | null>(null);
  token = this.#tokenSignal.asReadonly();
  isLoggedIn = computed(() => !!this.token());
  
  async login(email:string, password:string){
    const login$ = this.http.post(this.url+"/auth/login", {email, password}, { withCredentials: true })
    const user:any  = await firstValueFrom(login$);
    this.#tokenSignal.set(user.token);
    return user;
  }

  async refreshToken(){
    const refresh$ = this.http.post(this.url+"/auth/refresh", null, {
      withCredentials: true
    })
    const user:any  = await firstValueFrom(refresh$);
    this.#tokenSignal.set(user.token);
    return user;
  }

  async getUserProfile(){
    const profile$ = this.http.get(this.url+"/auth/profile", { withCredentials: true })
    const profile  = await firstValueFrom(profile$);
    return profile;
  }

  async logOut(){
    const message$ = this.http.get(this.url+"/auth/logout", { withCredentials: true })
    const msg  = await firstValueFrom(message$);
    this.#tokenSignal.set(null);
    return msg;
  }
}

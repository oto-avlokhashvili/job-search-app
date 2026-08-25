import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { User } from '../Interfaces/user';
import { skipLoading } from '../loading/skip-loading.component';

@Injectable({
  providedIn: 'root',
})
export class Users {
  http = inject(HttpClient);
  url = environment.apiUrl;
  getUserById(id:number, data:any):Observable<User> {
    return this.http.patch<User>(this.url + "/user/" + id, data, {
      context: new HttpContext().set(skipLoading, true)
    });
  }
}

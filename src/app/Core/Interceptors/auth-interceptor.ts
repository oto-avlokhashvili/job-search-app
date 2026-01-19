import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { AuthService } from '../Services/auth-service';
import { inject, signal } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
let refreshToken = signal(null);
let isRefreshing = signal(false);
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const authToken = authService.token();

  if(authToken){
    return next(addToken(req, authToken));
  }

  return next(req).pipe(
    catchError(err => {
      if(err.status === 401){
        console.log(err.status);
        return handle401(req, next, authService);
      }
      return throwError(() => err)
    })
  );
};

function addToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({
    setHeaders: {
      Authorization: `${token}`
    }
  });
}

function handle401(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
): Observable<HttpEvent<unknown>> {
  const authToken = authService.token();
  if(!isRefreshing()){
    isRefreshing.set(true);
    refreshToken.set(null)
    if(authToken){
      authService.logOut();
    }
    return next(req);
  }
  return next(req);
}
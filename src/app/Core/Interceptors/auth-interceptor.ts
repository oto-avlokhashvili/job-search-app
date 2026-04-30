import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../Services/auth-service';
import { inject, signal } from '@angular/core';
import { catchError, Observable, throwError, from, switchMap } from 'rxjs';
import { Router } from '@angular/router';

let isRefreshing = signal(false);
let pendingRequests = signal<Array<{
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  resolve: (value: Observable<HttpEvent<unknown>>) => void,
  reject: (error: any) => void
}>>([]);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const authToken = authService.token();
  const router = inject(Router);
  // Skip auth for login, refresh, and logout endpoints
  if (isAuthEndpoint(req.url)) {
    return next(req);
  }

  // Add token to request if available
  const authReq = authToken ? addToken(req, authToken) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isAuthEndpoint(req.url)) {
        return handle401Error(req, next, authService,router);
      }
      return throwError(() => error);
    })
  );
};

function addToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`
    }
  });
}

function isAuthEndpoint(url: string): boolean {
  return url.includes('/auth/login') || 
         url.includes('/auth/refresh') || 
         url.includes('/auth/logout');
}

function handle401Error(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  router: Router // ← add parameter
): Observable<HttpEvent<unknown>> {
  
  if (!isRefreshing()) {
    isRefreshing.set(true);
    
    return from(
      authService.refreshToken()
        .then(user => {
          isRefreshing.set(false);
          
          const requests = pendingRequests();
          pendingRequests.set([]);
          
          requests.forEach(({ req: pendingReq, next: pendingNext, resolve }) => {
            const newToken = user.token;
            const retryReq = newToken ? addToken(pendingReq, newToken) : pendingReq;
            resolve(pendingNext(retryReq));
          });
          
          const newToken = authService.token();
          return newToken ? addToken(req, newToken) : req;
        })
        .catch(error => {
          isRefreshing.set(false);
          pendingRequests.set([]);
          
          authService.logOut()
            .catch(() => {})
            .finally(() => {
              router.navigate(['/auth']); // ← redirect after logout settles
            });
          
          throw error;
        })
    ).pipe(
      switchMap(retryReq => next(retryReq))
    );
  } else {
    return new Observable<HttpEvent<unknown>>(observer => {
      const promise = new Promise<Observable<HttpEvent<unknown>>>((resolve, reject) => {
        const current = pendingRequests();
        pendingRequests.set([...current, { req, next, resolve, reject }]);
      });

      promise
        .then(retryObservable => {
          retryObservable.subscribe({
            next: (event) => observer.next(event),
            error: (err) => observer.error(err),
            complete: () => observer.complete()
          });
        })
        .catch(error => observer.error(error));
    });
  }
}
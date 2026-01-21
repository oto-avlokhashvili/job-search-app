import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../Services/auth-service';
import { inject, signal } from '@angular/core';
import { catchError, Observable, throwError, from, switchMap } from 'rxjs';

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

  // Skip auth for login, refresh, and logout endpoints
  if (isAuthEndpoint(req.url)) {
    return next(req);
  }

  // Add token to request if available
  const authReq = authToken ? addToken(req, authToken) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isAuthEndpoint(req.url)) {
        return handle401Error(req, next, authService);
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
  authService: AuthService
): Observable<HttpEvent<unknown>> {
  
  if (!isRefreshing()) {
    isRefreshing.set(true);
    
    return from(
      authService.refreshToken()
        .then(user => {
          isRefreshing.set(false);
          
          // Process all pending requests
          const requests = pendingRequests();
          pendingRequests.set([]);
          
          requests.forEach(({ req: pendingReq, next: pendingNext, resolve }) => {
            const newToken = user.token;
            const retryReq = newToken ? addToken(pendingReq, newToken) : pendingReq;
            resolve(pendingNext(retryReq));
          });
          
          // Retry the original request
          const newToken = authService.token();
          return newToken ? addToken(req, newToken) : req;
        })
        .catch(error => {
          isRefreshing.set(false);
          pendingRequests.set([]);
          
          // Clear token and logout
          authService.logOut().catch(() => {});
          
          throw error;
        })
    ).pipe(
      switchMap(retryReq => next(retryReq))
    );
  } else {
    // Token refresh is in progress, queue this request
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
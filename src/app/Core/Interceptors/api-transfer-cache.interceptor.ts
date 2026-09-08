import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject, makeStateKey, PLATFORM_ID, TransferState } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { of, tap } from 'rxjs';

interface CachedApiResponse {
  body: unknown;
  status: number;
}

// Replaces Angular's built-in HTTP transfer cache for /api/* calls, because that
// built-in cache computes its key from the *final* outgoing request - which, on the
// server, has already been rewritten to an absolute backend URL by
// ssrApiBaseUrlInterceptor (registered downstream, in app.config.server.ts). The
// client always requests the original relative /api/... URL, so the two keys never
// match and the built-in cache always misses. This interceptor runs upstream of that
// rewrite, so it keys on the same relative URL on both server and client.
export const apiTransferCacheInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET' || !req.url.startsWith('/api/') || req.headers.has('Authorization')) {
    return next(req);
  }

  const transferState = inject(TransferState);
  const key = makeStateKey<CachedApiResponse>(`api-cache:${req.urlWithParams}`);

  if (isPlatformServer(inject(PLATFORM_ID))) {
    return next(req).pipe(
      tap((event) => {
        if (event instanceof HttpResponse) {
          transferState.set(key, { body: event.body, status: event.status });
        }
      })
    );
  }

  if (transferState.hasKey(key)) {
    const cached = transferState.get(key, null);
    transferState.remove(key);
    if (cached) {
      return of(new HttpResponse({ body: cached.body, status: cached.status }));
    }
  }
  return next(req);
};

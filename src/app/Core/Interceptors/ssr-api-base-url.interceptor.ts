import { HttpInterceptorFn } from '@angular/common/http';
import { timeout } from 'rxjs';
import { API_TARGET } from '../../../environments/api-target';

// A server render waits for every pending request, so one slow backend call would
// stall the whole page. Past this limit the request fails, the page renders its
// loading/error state, and the browser refetches after hydration (nothing was put
// in the transfer cache for it).
const SSR_API_TIMEOUT_MS = 5000;

// Relative /api/* URLs mean nothing to Node's fetch during SSR - only the browser
// resolves them against the current origin. Rewrite them straight to the real
// backend here so server-rendered HttpClient calls still work.
// Registered only in app.config.server.ts - never runs in the browser bundle.
export const ssrApiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/api/')) {
    return next(req.clone({ url: API_TARGET + req.url.slice('/api'.length) })).pipe(
      timeout(SSR_API_TIMEOUT_MS),
    );
  }
  return next(req);
};

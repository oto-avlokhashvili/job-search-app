import { HttpInterceptorFn } from '@angular/common/http';
import { API_TARGET } from '../../../environments/api-target';

// Relative /api/* URLs mean nothing to Node's fetch during SSR - only the browser
// resolves them against the current origin. Rewrite them straight to the real
// backend here so server-rendered HttpClient calls still work.
// Registered only in app.config.server.ts - never runs in the browser bundle.
export const ssrApiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/api/')) {
    return next(req.clone({ url: API_TARGET + req.url.slice('/api'.length) }));
  }
  return next(req);
};

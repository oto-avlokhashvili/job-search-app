import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Account pages: no server session exists, so render fully client-side.
  { path: 'profile', renderMode: RenderMode.Client },
  { path: 'notifications', renderMode: RenderMode.Client },
  { path: 'analytics', renderMode: RenderMode.Client },
  {
    // Old /private/* URLs only redirect to the account pages above.
    path: 'private/**',
    renderMode: RenderMode.Client
  },
  {
    // Public/landing pages (home, auth, etc.): render on demand per request.
    // Not prerendered — job listings are live data that would otherwise go stale until the next build.
    path: '**',
    renderMode: RenderMode.Server
  }
];

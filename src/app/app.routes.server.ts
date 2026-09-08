import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // Private/authenticated area: no server session exists, so render fully client-side.
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

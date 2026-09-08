// The real backend origin. Only ever used server-side (server.ts's /api proxy,
// and the SSR-only interceptor that resolves relative /api/* HttpClient calls
// during server rendering) - never bundled into the browser build.
export const API_TARGET = process.env['API_TARGET'] ?? 'https://job-search-api-production-545e.up.railway.app';

// Server-only secrets shared with the API. Import this only from server code
// (server.ts, seo-indexing.ts, server-only interceptors), never from browser code.

/** Unlocks internal API endpoints (sitemap, scrapers, job management). */
export const INTERNAL_API_KEY = process.env['INTERNAL_API_KEY'] ?? '';

/** Proves to the API that a request was relayed by this server, so it trusts X-Client-IP. */
export const PROXY_SHARED_SECRET = process.env['PROXY_SHARED_SECRET'] ?? '';

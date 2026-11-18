// Server-only secrets shared with the API. Import this only from server code
// (server.ts, server-only interceptors), never from browser code.

/** Proves to the API that a request was relayed by this server, so it trusts X-Client-IP. */
export const PROXY_SHARED_SECRET = process.env['PROXY_SHARED_SECRET'] ?? '';

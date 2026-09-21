export const API_TARGET =
  process.env['API_TARGET'] ??
  (process.env['NODE_ENV'] === 'production'
    ? 'https://job-search-api-production-545e.up.railway.app'
    : 'http://localhost:3000');

export const environment = {
  production: false,
  apiUrl: '/api',
  telegramUrl: "https://t.me/job_notifcation_bot",
  // Cloudflare Turnstile site key. Local dev uses Cloudflare's public test key (always passes, works on
  // localhost; pair with the test secret on the API). The real key is in environment.prod.ts.
  turnstileSiteKey: "1x00000000000000000000AA",

};
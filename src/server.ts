import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import compression from 'compression';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { BlockList, isIP } from 'node:net';
import { join } from 'node:path';
import { API_TARGET } from './environments/api-target';
import { PROXY_SHARED_SECRET } from './environments/server-secrets';
import { extractJobIdFromSlug } from './app/Core/Utils/slug-generator';
import { findCityLanding, getLandingPage, landingSearchParams, type LandingPage } from './app/Core/Utils/landing-pages';

const SITE_URL = 'https://jobup.ge';

const browserDistFolder = join(import.meta.dirname, '../browser');

// https://www.cloudflare.com/ips/
const CLOUDFLARE_RANGES = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
  '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
  '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
  '2a06:98c0::/29', '2c0f:f248::/32',
];
const cloudflareIps = new BlockList();
for (const range of CLOUDFLARE_RANGES) {
  const [net, prefix] = range.split('/');
  cloudflareIps.addSubnet(net, Number(prefix), isIP(net) === 6 ? 'ipv6' : 'ipv4');
}
const isCloudflareIp = (addr: string) => {
  const ip = addr.replace(/^::ffff:/, '');
  const family = isIP(ip);
  return family !== 0 && cloudflareIps.check(ip, family === 6 ? 'ipv6' : 'ipv4');
};

const app = express();
// Hop 0 is always Railway's edge. Hop 1 is trusted only when it's a Cloudflare edge, so req.ip
// is the real visitor whether or not the Cloudflare proxy is on, and can't be spoofed by
// sending an X-Forwarded-For header straight to Railway.
app.set('trust proxy', (addr: string, i: number) => i === 0 || (i === 1 && isCloudflareIp(addr)));

// Gzip HTML, JS, CSS and proxied API JSON. Railway bills outbound traffic and doesn't compress it for us.
app.use(compression());

// Railway's proxy adds X-Forwarded-* headers (notably X-Forwarded-For) to every request.
// Angular falls back to client-side rendering, with an empty page for crawlers,
// whenever it sees an X-Forwarded-* header that isn't trusted, and by default it only
// trusts -Host and -Proto. Hostnames are still checked against allowedHosts.
const angularApp = new AngularNodeAppEngine({
  trustProxyHeaders: ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port'],
});

/**
 * 1. Global API Rate Limiter
 * Restricts client IPs to 100 requests per minute across all /api/* routes
 */
const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many requests, please slow down.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

/**
 * 2. Strict Job Search / Listings Rate Limiter
 * Protects scraping on job listing and search endpoints
 */
const jobApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 45,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many job requests, please slow down.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

app.use('/api', generalApiLimiter);
app.use('/api/job', jobApiLimiter);

/**
 * 3. Deep Pagination Protection (Scraping Barrier)
 * Enforces authorization for pages beyond page 5.
 */
app.use('/api/job', (req, res, next) => {
  const page = parseInt(req.query['page'] as string, 10);
  const authHeader = req.headers['authorization'];

  if (!isNaN(page) && page > 5 && (!authHeader || !authHeader.startsWith('Bearer '))) {
    res.status(401).json({
      message: 'Authorization required for accessing pages beyond page 5.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }
  next();
});

/**
 * Proxy same-origin /api/* calls to the real backend, so the browser (and any
 * private/authenticated page) never needs to know the backend's actual URL.
 */
app.use(
  '/api',
  createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    on: {
      // Every proxied request reaches the API from this server's address, so pass the
      // visitor's own IP for the API's per-IP rate limits. Never relay a client-sent one.
      proxyReq: (proxyReq, req) => {
        proxyReq.removeHeader('x-client-ip');
        proxyReq.removeHeader('x-proxy-key');
        const clientIp = (req as express.Request).ip;
        if (PROXY_SHARED_SECRET && clientIp) {
          proxyReq.setHeader('X-Proxy-Key', PROXY_SHARED_SECRET);
          proxyReq.setHeader('X-Client-IP', clientIp);
        }
      },
    },
  }),
);

/**
 * Permanent redirects for legacy URLs, so search engines consolidate ranking onto
 * one address instead of following the client-side router redirects.
 */
const withQuery = (req: express.Request, path: string) => {
  const i = req.originalUrl.indexOf('?');
  return i === -1 ? path : path + req.originalUrl.slice(i);
};
// Home is the search; the old vacancies page isn't used any more (its search parameters work on home)
app.get('/', (req, res) => res.redirect(301, withQuery(req, '/home')));
app.get('/vacancies', (req, res) => res.redirect(301, withQuery(req, '/home')));
app.get('/home/vacancies', (req, res) => res.redirect(301, withQuery(req, '/home')));
app.get('/home/vacancies/:slug', (req, res) =>
  res.redirect(301, withQuery(req, `/vacancies/${encodeURIComponent(req.params.slug)}`)),
);
app.get('/privacy-policy', (req, res) => res.redirect(301, '/privacy'));
app.get('/terms-and-conditions', (req, res) => res.redirect(301, '/terms'));

/** The home search filtered the way a keyword search was: /home?location=თბილისი&search=IT */
const homeSearchUrl = (page: LandingPage) => '/home?' + new URLSearchParams(landingSearchParams(page)).toString();

/**
 * Neither vacancies nor keyword searches have pages of their own any more; their old URLs (from
 * Google or shared links) move permanently to the home search, so the ranking they earned stays
 * with Job Up. A keyword (/vacancies/tbilisi) opens the search with its filters; a vacancy, the
 * search in its city, or plain home when the city isn't known or the job is gone.
 */
app.get('/vacancies/:slug', async (req, res) => {
  const slug = req.params.slug;
  const landing = getLandingPage(slug);
  if (landing) return res.redirect(301, homeSearchUrl(landing));

  let target = '/home';
  const id = extractJobIdFromSlug(slug);
  if (id && /^\d+$/.test(id)) {
    try {
      const response = await fetch(`${API_TARGET}/job/${id}`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const city = findCityLanding(((await response.json()) as { location?: string })?.location);
        if (city) target = homeSearchUrl(city);
      }
    } catch {
      // Backend slow or down: the search is still a fine place to land
    }
  }
  res.redirect(301, target);
});

/**
 * Company pages are gone for good: they were what a company found when it searched its own name.
 * 410 (not 404) tells search engines to drop them quickly.
 */
app.get('/companies/:key', (_req, res) => {
  res
    .status(410)
    .set('X-Robots-Tag', 'noindex')
    .type('html')
    .send(
      '<!doctype html><html lang="ka"><head><meta charset="utf-8"><meta name="robots" content="noindex">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1"><title>გვერდი აღარ არსებობს | Job Up</title></head>' +
        '<body style="font-family:Arial,sans-serif;text-align:center;padding:64px 16px;color:#1f2937">' +
        '<h1 style="font-size:22px">ეს გვერდი აღარ არსებობს</h1>' +
        '<p><a href="/home" style="color:#0e6094">მოძებნე ვაკანსიები Job Up-ზე →</a></p></body></html>',
    );
});

/**
 * Sitemap: the site's own pages. Never single vacancies, companies or the old keyword addresses (they redirect).
 */
const SITEMAP_TTL_MS = 60 * 60 * 1000;
let sitemapCache: { xml: string; expiresAt: number } | null = null;

function buildSitemap(): string {
  const todayIso = new Date().toISOString().slice(0, 10);
  const urls: string[] = [
    `<url><loc>${SITE_URL}/home</loc><lastmod>${todayIso}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${SITE_URL}/employers</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
    `<url><loc>${SITE_URL}/about</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>`,
    `<url><loc>${SITE_URL}/contact</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>`,
    `<url><loc>${SITE_URL}/privacy</loc><changefreq>yearly</changefreq><priority>0.2</priority></url>`,
    `<url><loc>${SITE_URL}/terms</loc><changefreq>yearly</changefreq><priority>0.2</priority></url>`,
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

app.get('/sitemap.xml', (_req, res) => {
  // Rebuilt hourly so <lastmod> stays current
  if (!sitemapCache || sitemapCache.expiresAt < Date.now()) {
    sitemapCache = { xml: buildSitemap(), expiresAt: Date.now() + SITEMAP_TTL_MS };
  }
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(sitemapCache.xml);
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

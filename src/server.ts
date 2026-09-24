import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { join } from 'node:path';
import { API_TARGET } from './environments/api-target';
import { generateJobSlug } from './app/Core/Utils/slug-generator';
import { parseJobDate, toIsoDate } from './app/Core/Utils/date-parse';
import { LANDING_PAGES } from './app/Core/Utils/landing-pages';
import { startIndexingNotifier } from './seo-indexing';

const SITE_URL = 'https://jobup.ge';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
app.set('trust proxy', 1);

const angularApp = new AngularNodeAppEngine();

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
app.get('/', (req, res) => res.redirect(301, withQuery(req, '/vacancies')));
app.get('/home/vacancies', (req, res) => res.redirect(301, withQuery(req, '/vacancies')));
app.get('/home/vacancies/:slug', (req, res) =>
  res.redirect(301, withQuery(req, `/vacancies/${encodeURIComponent(req.params.slug)}`)),
);
app.get('/privacy-policy', (req, res) => res.redirect(301, '/privacy'));
app.get('/terms-and-conditions', (req, res) => res.redirect(301, '/terms'));

/**
 * Dynamic sitemap of every active vacancy. Fetched straight from the backend
 * (bypassing the public page-5 limit above) and cached in memory for an hour.
 */
const SITEMAP_TTL_MS = 60 * 60 * 1000;
const SITEMAP_PAGE_SIZE = 5000;
const SITEMAP_MAX_PAGES = 5; // backend rejects page > 5
let sitemapCache: { xml: string; expiresAt: number } | null = null;
let sitemapInFlight: Promise<string> | null = null;

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function buildSitemap(): Promise<string> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const urls: string[] = [
    `<url><loc>${SITE_URL}/vacancies</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${SITE_URL}/home</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
    `<url><loc>${SITE_URL}/privacy</loc><changefreq>yearly</changefreq><priority>0.2</priority></url>`,
    `<url><loc>${SITE_URL}/terms</loc><changefreq>yearly</changefreq><priority>0.2</priority></url>`,
    ...LANDING_PAGES.map(
      (p) => `<url><loc>${SITE_URL}/vacancies/${p.slug}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`,
    ),
  ];
  const seen = new Set<string>();

  for (let page = 1; page <= SITEMAP_MAX_PAGES; page++) {
    const response = await fetch(`${API_TARGET}/job/all?page=${page}&limit=${SITEMAP_PAGE_SIZE}`);
    if (!response.ok) throw new Error(`Backend responded ${response.status} for sitemap page ${page}`);
    const { jobs = [] } = (await response.json()) as {
      jobs?: { id: number; vacancy?: string; company?: string; publishDate?: string; deadline?: string }[];
    };

    for (const job of jobs) {
      if (!job?.id || seen.has(String(job.id))) continue;
      const deadline = parseJobDate(job.deadline);
      if (deadline && deadline < today) continue; // expired
      seen.add(String(job.id));

      const loc = `${SITE_URL}/vacancies/${generateJobSlug(job.vacancy, job.company, job.id)}`;
      const lastmod = toIsoDate(job.publishDate);
      urls.push(
        `<url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>daily</changefreq><priority>0.7</priority></url>`,
      );
    }

    if (jobs.length < SITEMAP_PAGE_SIZE) break;
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

app.get('/sitemap.xml', async (_req, res) => {
  if (!sitemapCache || sitemapCache.expiresAt < Date.now()) {
    try {
      sitemapInFlight ??= buildSitemap().finally(() => (sitemapInFlight = null));
      sitemapCache = { xml: await sitemapInFlight, expiresAt: Date.now() + SITEMAP_TTL_MS };
    } catch (err) {
      console.error('Sitemap generation failed:', err);
      if (!sitemapCache) {
        res.status(503).set('Retry-After', '300').send('Sitemap temporarily unavailable');
        return;
      }
      // Otherwise fall through and serve the stale copy.
    }
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

  startIndexingNotifier({ apiTarget: API_TARGET, siteUrl: SITE_URL });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

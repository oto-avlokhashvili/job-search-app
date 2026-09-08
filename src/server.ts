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

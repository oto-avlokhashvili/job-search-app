import { createSign } from 'node:crypto';
import { generateJobSlug } from './app/Core/Utils/slug-generator';
import { parseJobDate } from './app/Core/Utils/date-parse';

/**
 * Google Indexing API notifier for new vacancies.
 *
 * Google officially supports this API for pages with JobPosting markup; notifying
 * it gets new jobs crawled within hours instead of days.
 *
 * Disabled unless GOOGLE_INDEXING_SA_KEY holds a service-account JSON key (raw or
 * base64). That service account must be added as an Owner of jobup.ge in Search Console.
 *
 * Seen job IDs are kept in memory only. After a restart, only jobs published in the
 * last ~36 hours are re-sent, and a daily cap keeps the process inside the default quota of
 * 200 publish requests per day.
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface IndexingOptions {
  apiTarget: string;
  siteUrl: string;
}

const POLL_INTERVAL_MS = 30 * 60 * 1000;
const RECENT_JOBS_LIMIT = 300;
const DAILY_CAP = Number(process.env['GOOGLE_INDEXING_DAILY_CAP'] || 180);
const SCOPE = 'https://www.googleapis.com/auth/indexing';

let accessToken: { value: string; expiresAt: number } | null = null;
const notifiedIds = new Set<string>();
let sentToday = 0;
let quotaDay = '';

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env['GOOGLE_INDEXING_SA_KEY'];
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const key = JSON.parse(json) as ServiceAccount;
    return key.client_email && key.private_key ? key : null;
  } catch {
    console.error('[indexing] GOOGLE_INDEXING_SA_KEY is not valid JSON or base64 JSON');
    return null;
  }
}

const base64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (accessToken && accessToken.expiresAt > Date.now() + 60_000) return accessToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
  const assertion = `${header}.${claims}.${base64url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error(`token request failed: ${response.status} ${await response.text()}`);
  const { access_token, expires_in } = (await response.json()) as { access_token: string; expires_in: number };
  accessToken = { value: access_token, expiresAt: Date.now() + expires_in * 1000 };
  return access_token;
}

async function publish(sa: ServiceAccount, url: string): Promise<void> {
  const token = await getAccessToken(sa);
  const response = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type: 'URL_UPDATED' }),
  });
  if (!response.ok) throw new Error(`publish ${response.status}: ${await response.text()}`);
}

async function notifyNewJobs(sa: ServiceAccount, options: IndexingOptions, isFirstRun: boolean) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== quotaDay) {
    quotaDay = today;
    sentToday = 0;
  }
  if (sentToday >= DAILY_CAP) return;

  const response = await fetch(`${options.apiTarget}/job/all?page=1&limit=${RECENT_JOBS_LIMIT}`);
  if (!response.ok) throw new Error(`backend responded ${response.status}`);
  const { jobs = [] } = (await response.json()) as {
    jobs?: { id: number; vacancy?: string; company?: string; publishDate?: string }[];
  };

  // On the first run after a restart we don't know what was already sent, so only
  // consider jobs published in the last ~36 hours (publish dates have no time part).
  const cutoff = Date.now() - 36 * 60 * 60 * 1000;
  const fresh = jobs.filter((job) => {
    if (!job?.id || notifiedIds.has(String(job.id))) return false;
    if (!isFirstRun) return true;
    const published = parseJobDate(job.publishDate);
    return !!published && published.getTime() >= cutoff;
  });

  if (isFirstRun) {
    // Everything older is treated as already known.
    const freshIds = new Set(fresh.map((job) => String(job.id)));
    for (const job of jobs) if (job?.id && !freshIds.has(String(job.id))) notifiedIds.add(String(job.id));
  }

  let sent = 0;
  for (const job of fresh) {
    if (sentToday >= DAILY_CAP) break;
    const url = `${options.siteUrl}/vacancies/${generateJobSlug(job.vacancy, job.company, job.id)}`;
    try {
      await publish(sa, url);
      notifiedIds.add(String(job.id));
      sentToday++;
      sent++;
    } catch (err) {
      console.error(`[indexing] ${url}:`, err instanceof Error ? err.message : err);
      if (String(err).includes('429')) break; // quota exhausted; retry next poll
    }
  }
  if (sent > 0) console.log(`[indexing] notified Google of ${sent} new vacancies (${sentToday}/${DAILY_CAP} today)`);
}

export function startIndexingNotifier(options: IndexingOptions) {
  const sa = loadServiceAccount();
  if (!sa) return;

  console.log(`[indexing] Google Indexing API enabled for ${sa.client_email}`);
  let isFirstRun = true;
  const run = () =>
    notifyNewJobs(sa, options, isFirstRun)
      // Only leave first-run mode after a successful poll, otherwise a failed first
      // poll would make the next one treat every recent job as new.
      .then(() => (isFirstRun = false))
      .catch((err) => console.error('[indexing] poll failed:', err instanceof Error ? err.message : err));

  setTimeout(run, 60_000).unref(); // let the server warm up first
  setInterval(run, POLL_INTERVAL_MS).unref();
}

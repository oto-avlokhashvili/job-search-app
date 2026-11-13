/**
 * The application link a vacancy's description points to (Helio, Google Forms, a careers page...),
 * for vacancies without an email to quick-apply to. Job portals we import from, social networks,
 * images and privacy pages never count.
 */

// Portals we import from: their links are never shown (see the API's public-link.ts)
const PORTAL_HOSTS = ['jobs.ge', 'hr.ge', 'cv.ge', 'doctor.ge', 'chefs.ge', 'awork.ge', 'myjobs.ge'];

const IGNORED_HOSTS = [
  'facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'tiktok.com', 'youtube.com', 'youtu.be',
  'twitter.com', 'x.com', 't.me', 'wa.me', 'google.com/maps', 'maps.google.com', 'goo.gl/maps', 'maps.app.goo.gl',
];

// Application systems and form builders: the link is the application itself
const APPLY_HOSTS = [
  'helio.ge', 'hel-ai.com', 'forms.gle', 'docs.google.com/forms', 'forms.office.com', 'jotform.com', 'typeform.com',
  'airtable.com', 'smartrecruiters.com', 'workable.com', 'lever.co', 'greenhouse.io', 'bamboohr.com',
  'recruitee.com', 'teamtailor.com', 'breezy.hr', 'myworkdayjobs.com', 'hirehive.com', 'personio.de',
  'personio.com', 'zohorecruit.com', 'manatal.com', 'tally.so',
];

// Company career sites and upload pages ("careers.company.ge", "company.ge/vakansiebi", ".../cv-upload")
const APPLY_HINT = /appl|career|karier|job|vacanc|vakans|dasakm|dasaqm|recruit|hiring|talent|join|form|cv|resume|upload|submit/i;
const IGNORED_PATH = /privacy|policy|personal[-_]?data|cookie|terms|\.(png|jpe?g|gif|svg|webp|pdf)(\?|$)/i;

const matches = (hostAndPath: string, list: string[]) =>
  list.some((d) => {
    const [host, ...path] = d.split('/');
    const prefix = path.length ? `/${path.join('/')}` : '';
    const [h, ...rest] = hostAndPath.split('/');
    const p = rest.length ? `/${rest.join('/')}` : '';
    return (h === host || h.endsWith(`.${host}`)) && p.startsWith(prefix);
  });

function cleanUrl(raw: string): string | null {
  let url = raw.trim().replace(/&amp;/g, '&').replace(/[.,;:!?'")\]>]+$/, '');
  if (/^www\./i.test(url)) url = `https://${url}`;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

function score(url: string): number {
  const u = new URL(url);
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const hostAndPath = `${host}${u.pathname}`;
  if (matches(hostAndPath, PORTAL_HOSTS) || matches(hostAndPath, IGNORED_HOSTS)) return 0;
  if (IGNORED_PATH.test(u.pathname)) return 0;
  // LinkedIn counts only for a job posting, not a company or person page
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return u.pathname.startsWith('/jobs') ? 2 : 0;
  if (matches(hostAndPath, APPLY_HOSTS)) return 3;
  if (APPLY_HINT.test(`${host}${u.pathname}${u.search}`)) return 2;
  return 1;
}

export function extractApplyUrl(description: string | null | undefined): string | null {
  if (!description) return null;
  const found = [
    ...[...description.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]),
    ...(description.match(/\b(?:https?:\/\/|www\.)[^\s"'<>]+/gi) ?? []),
  ];
  let best: string | null = null;
  let bestScore = 0;
  for (const raw of found) {
    const url = cleanUrl(raw);
    if (!url) continue;
    const s = score(url);
    if (s > bestScore) {
      best = url;
      bestScore = s;
    }
  }
  return best;
}

import { Job } from '../Interfaces/jobs';
import { SITE_NAME, SITE_URL } from '../Services/seo.service';
import { toIsoDate } from './date-parse';
import { LandingPage } from './landing-pages';

const REMOTE_PATTERN = /remote|დისტანციურ|online/i;

/** Plain-text descriptions get line breaks as <br>; Google expects HTML here. */
function toHtmlDescription(job: Job): string {
  const raw = (job.description?.trim() || job.requirements?.trim() || '');
  if (!raw) {
    return `${job.company} აცხადებს ვაკანსიას პოზიციაზე: ${job.vacancy}. ლოკაცია: ${job.location || 'საქართველო'}.`;
  }
  if (/<\s*(p|br|div|ul|ol|li)\b/i.test(raw)) return raw;
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br>');
}

/**
 * schema.org JobPosting for Google for Jobs.
 * Returns null if the required datePosted can't be determined, rather than emitting
 * markup Search Console would flag as invalid.
 */
export function buildJobPostingSchema(job: Job, pageUrl: string, isJobUp: boolean): object | null {
  const datePosted = toIsoDate(job.publishDate);
  if (!datePosted || !job.vacancy) return null;

  const validThrough = toIsoDate(job.deadline);
  const location = (job.location || '').trim();
  const isRemote = REMOTE_PATTERN.test(location);

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.vacancy,
    description: toHtmlDescription(job),
    datePosted,
    url: pageUrl,
    identifier: { '@type': 'PropertyValue', name: SITE_NAME, value: String(job.id) },
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company || SITE_NAME,
      ...(isJobUp ? { sameAs: SITE_URL, logo: `${SITE_URL}/favicon/web-app-manifest-512x512.png` } : {}),
    },
  };

  if (validThrough) {
    // End of the deadline day, Tbilisi time.
    schema['validThrough'] = `${validThrough}T23:59:59+04:00`;
  }

  if (isRemote) {
    schema['jobLocationType'] = 'TELECOMMUTE';
    schema['applicantLocationRequirements'] = { '@type': 'Country', name: 'Georgia' };
  } else {
    schema['jobLocation'] = {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        ...(location ? { addressLocality: location } : {}),
        addressCountry: 'GE',
      },
    };
  }

  return schema;
}

export function buildJobBreadcrumbSchema(job: Job, pageUrl: string, cityPage?: LandingPage): object {
  const crumbs = [
    { name: 'ვაკანსიები', item: `${SITE_URL}/vacancies` },
    ...(cityPage ? [{ name: cityPage.h1, item: `${SITE_URL}/vacancies/${cityPage.slug}` }] : []),
    { name: job.vacancy, item: pageUrl },
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, ...c })),
  };
}

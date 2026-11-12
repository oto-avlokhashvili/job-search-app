import { signal } from '@angular/core';

/** Wider than this (width / height) gets a wide tile instead of a square one */
const WIDE_RATIO = 1.5;

/**
 * Companies with their own icon in /public/icons, matched on companyKey (every spelling and
 * group company: "თიბისი დაზღვევა", "TBC Leasing", "Bank of Georgia"...). Sharper than the
 * scraped logos and shown edge to edge, like the home page's hot vacancies.
 */
const BRAND_ICONS: readonly { pattern: RegExp; icon: string }[] = [
  { pattern: /^(tbc|თიბისი)/, icon: '/icons/tbc.jpg' },
  { pattern: /^(bankofgeorgia|საქართველოსბანკი)$/, icon: '/icons/bog.png' },
];

export function brandIcon(companyKey: string | null | undefined): string | null {
  return (companyKey && BRAND_ICONS.find((b) => b.pattern.test(companyKey))?.icon) || null;
}

/**
 * Company logos on vacancy cards: shown when a vacancy has one, until that image fails to load
 * (then the card falls back to its letter avatar / icon). One instance per page.
 */
export class CompanyLogos {
  private failed = signal<ReadonlySet<string>>(new Set());
  private wide = signal<ReadonlySet<string>>(new Set());

  /** A vacancy's logo: the company's own icon when there is one, else the scraped logo */
  of(job: { companyKey?: string | null; companyLogo?: string | null }): string | null {
    return brandIcon(job.companyKey) || job.companyLogo || null;
  }

  /** Our own /icons files fill their tile edge to edge, with no white frame */
  isBrand(url: string | null | undefined): boolean {
    return !!url && url.startsWith('/icons/');
  }

  show(url: string | null | undefined): url is string {
    return !!url && !this.failed().has(url);
  }

  broken(url: string | null | undefined) {
    if (url) this.failed.update((set) => new Set(set).add(url));
  }

  /** Wordmark-style logos (e.g. 3:1) are unreadable in a square; they get a wide tile */
  isWide(url: string | null | undefined): boolean {
    return !!url && this.wide().has(url);
  }

  loaded(event: Event, url: string | null | undefined) {
    const img = event.target as HTMLImageElement;
    if (url && img.naturalWidth > img.naturalHeight * WIDE_RATIO && !this.wide().has(url)) {
      this.wide.update((set) => new Set(set).add(url));
    }
  }
}

import { signal } from '@angular/core';

/** Wider than this (width / height) gets a wide tile instead of a square one */
const WIDE_RATIO = 1.5;

/**
 * Company logos on vacancy cards: shown when a vacancy has one, until that image fails to load
 * (then the card falls back to its letter avatar / icon). One instance per page.
 */
export class CompanyLogos {
  private failed = signal<ReadonlySet<string>>(new Set());
  private wide = signal<ReadonlySet<string>>(new Set());

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

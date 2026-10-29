import { signal } from '@angular/core';

/**
 * Company logos on vacancy cards: shown when a vacancy has one, until that image fails to load
 * (then the card falls back to its letter avatar / icon). One instance per page.
 */
export class CompanyLogos {
  private failed = signal<ReadonlySet<string>>(new Set());

  show(url: string | null | undefined): url is string {
    return !!url && !this.failed().has(url);
  }

  broken(url: string | null | undefined) {
    if (url) this.failed.update((set) => new Set(set).add(url));
  }
}

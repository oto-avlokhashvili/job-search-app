import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export const SITE_URL = 'https://jobup.ge';
export const SITE_NAME = 'Job Up';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/favicon/web-app-manifest-512x512.png`;

export interface SeoConfig {
  title: string;
  description: string;
  /** Path of the canonical URL, e.g. "/vacancies". */
  path: string;
  image?: string;
  type?: 'website' | 'article';
  noindex?: boolean;
}

const JSON_LD_CLASS = 'page-json-ld';

/**
 * Single place for per-page SEO tags. Uses Angular's DOCUMENT/Meta/Title (not the
 * global `document`), so everything here is emitted in the server-rendered HTML
 * that crawlers read.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private document = inject(DOCUMENT);
  private title = inject(Title);
  private meta = inject(Meta);

  update(config: SeoConfig) {
    const url = SITE_URL + config.path;
    const image = config.image || DEFAULT_OG_IMAGE;
    const description = truncate(config.description, 160);

    this.title.setTitle(config.title);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({
      name: 'robots',
      content: config.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large',
    });

    this.meta.updateTag({ property: 'og:title', content: config.title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: config.type || 'website' });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ property: 'og:locale', content: 'ka_GE' });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary' });
    this.meta.updateTag({ name: 'twitter:title', content: config.title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    this.setCanonical(url);
    this.clearJsonLd();
  }

  /** Adds a page-scoped JSON-LD block. Cleared on the next update() call. */
  addJsonLd(data: object) {
    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.className = JSON_LD_CLASS;
    // Escape "<" so a "</script>" inside scraped text can't break out of the tag.
    script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    this.document.head.appendChild(script);
  }

  clearJsonLd() {
    this.document.head
      .querySelectorAll(`script.${JSON_LD_CLASS}`)
      .forEach((el: Element) => el.remove());
  }

  private setCanonical(url: string) {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }
    link.href = url;
  }
}

function truncate(text: string, max: number): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + '…';
}

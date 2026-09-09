/**
 * Transliteration map for Georgian characters to Latin alphabet.
 */
const GEORGIAN_TO_LATIN_MAP: Record<string, string> = {
  'ა': 'a', 'ბ': 'b', 'გ': 'g', 'დ': 'd', 'ე': 'e', 'ვ': 'v', 'ზ': 'z',
  'თ': 't', 'ი': 'i', 'კ': 'k', 'ლ': 'l', 'მ': 'm', 'ნ': 'n', 'ო': 'o',
  'პ': 'p', 'ჟ': 'zh', 'რ': 'r', 'ს': 's', 'ტ': 't', 'უ': 'u', 'ფ': 'f',
  'ქ': 'k', 'ღ': 'gh', 'ყ': 'k', 'შ': 'sh', 'ჩ': 'ch', 'ც': 'ts', 'ძ': 'dz',
  'წ': 'ts', 'ჭ': 'ch', 'ხ': 'kh', 'ჯ': 'j', 'ჰ': 'h'
};

/**
 * Transliterate Georgian text to Latin characters.
 */
export function transliterateGeorgian(text: string): string {
  if (!text) return '';
  return text.split('').map(char => GEORGIAN_TO_LATIN_MAP[char] || char).join('');
}

/**
 * Creates a clean, URL-friendly slug from text.
 */
export function slugify(text: string): string {
  if (!text) return '';
  return transliterateGeorgian(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')    // remove non-alphanumeric (except spaces & dashes)
    .replace(/[\s_-]+/g, '-')     // replace spaces and underscores with single dash
    .replace(/^-+|-+$/g, '');     // trim leading/trailing dashes
}

/**
 * Generates an SEO-optimized slug for a vacancy URL.
 * Example: generateJobSlug('Senior React Developer', 'TBC Bank', 1234)
 * Returns: 'senior-react-developer-tbc-bank-1234'
 */
export function generateJobSlug(vacancy?: string, company?: string, id?: number | string): string {
  const parts: string[] = [];
  if (vacancy) parts.push(slugify(vacancy));
  if (company) parts.push(slugify(company));
  
  const textSlug = parts.filter(Boolean).join('-').substring(0, 80).replace(/-+$/, '');
  const idStr = id != null ? String(id) : '';

  if (textSlug && idStr) {
    return `${textSlug}-${idStr}`;
  }
  return idStr || textSlug || 'job';
}

/**
 * Extracts the job ID from a slug.
 * Works with:
 * - 'react-developer-tbc-123' -> '123'
 * - '123' -> '123'
 * - 'job-123' -> '123'
 */
export function extractJobIdFromSlug(slug: string): string | null {
  if (!slug) return null;
  const match = slug.match(/(?:^|-)(\d+)$/);
  return match ? match[1] : (isNaN(Number(slug)) ? null : slug);
}

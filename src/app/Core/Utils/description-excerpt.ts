/**
 * Imported vacancies show only the start of their description; the full text stays on the original
 * posting, which the page links to. Job Up's own vacancies show in full.
 */
export const EXCERPT_LENGTH = 500;

/** A description (HTML or plain text) as plain text, keeping line breaks and list bullets. */
export function descriptionToText(raw: string): string {
  return raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr|table)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+• /g, '\n• ')
    .trim();
}

/** The first ~`max` characters of the description as plain text, cut at a word and ending in "…". */
export function descriptionExcerpt(raw: string, max = EXCERPT_LENGTH): string {
  const text = descriptionToText(raw);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastBreak = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
  return `${(lastBreak > max * 0.6 ? cut.slice(0, lastBreak) : cut).trimEnd()}…`;
}

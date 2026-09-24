/**
 * Parses job dates coming from the API. Scraped portals send "dd/mm/yyyy";
 * Job Up's own postings may send ISO strings.
 */
export function parseJobDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const str = String(value).trim();
  const dmy = str.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const date = new Date(Date.UTC(+y, +m - 1, +d));
    return isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
}

/** "YYYY-MM-DD", or null if the value can't be parsed. */
export function toIsoDate(value: unknown): string | null {
  const date = parseJobDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

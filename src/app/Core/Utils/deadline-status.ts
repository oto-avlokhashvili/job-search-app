/** The deadline bar on vacancy cards and in the vacancies table. */

export interface DeadlineStatus {
  text: string;
  class: 'fresh' | 'warning' | 'urgent' | 'expired' | 'none';
  /** 0–100: the share of the application window still left (or freshness without a deadline) */
  progress: number;
}

/** "dd/mm/yyyy" or anything Date can read; null when it can't be read */
export function parseJobDateString(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  let date: Date;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split('/').map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(trimmed);
  }
  return isNaN(date.getTime()) ? null : date;
}

/** dd/mm/yyyy, as the job sites write dates */
export function formatShortDate(dateStr: any): string {
  if (!dateStr) return 'დღეს';
  if (typeof dateStr === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateStr.trim())) return dateStr.trim();
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

/**
 * Colour class plus `progress` for the bar: the share of the application window still left.
 * Without a deadline the bar shows freshness over a 30-day window instead.
 */
export function deadlineStatus(deadlineStr?: string, publishDateStr?: string): DeadlineStatus {
  const targetDateStr = deadlineStr || publishDateStr;
  if (!targetDateStr) return { text: 'მითითებული არ არის', class: 'none', progress: 0 };

  const targetDate = parseJobDateString(targetDateStr);
  if (!targetDate) return { text: targetDateStr, class: 'none', progress: 0 };

  const dayMs = 1000 * 60 * 60 * 24;
  const now = Date.now();
  const diffDays = Math.ceil((targetDate.getTime() - now) / dayMs);
  const text = formatShortDate(targetDateStr);
  const clamp = (p: number) => Math.max(0, Math.min(100, Math.round(p)));

  if (deadlineStr) {
    if (diffDays < 0) return { text, class: 'expired', progress: 0 };
    const published = parseJobDateString(publishDateStr);
    const windowMs = published && published < targetDate ? targetDate.getTime() - published.getTime() : 30 * dayMs;
    // Keep a sliver visible until the day itself passes
    const progress = Math.max(4, clamp(((targetDate.getTime() - now) / windowMs) * 100));
    return { text, class: diffDays <= 7 ? 'urgent' : diffDays <= 21 ? 'warning' : 'fresh', progress };
  }

  const daysOld = Math.abs(diffDays);
  const progress = Math.max(4, clamp(100 - (daysOld / 30) * 100));
  return { text, class: daysOld <= 7 ? 'fresh' : daysOld <= 21 ? 'warning' : 'urgent', progress };
}

/** The portals' icons, for the "which site is it from" hint */
export const SOURCE_ICONS: Record<string, string> = {
  'jobs.ge': '/icons/jobs.png',
  'hr.ge': '/icons/hr.png',
  'awork.ge': '/icons/awork.png',
  'myjobs.ge': '/icons/myjobsge.png',
  linkedin: '/icons/linkedin.png',
};

export function sourceLabel(source: string): string {
  return source === 'linkedin' ? 'LinkedIn' : source;
}

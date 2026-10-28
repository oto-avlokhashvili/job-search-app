import { HrInterview, InterviewStatus } from '../Interfaces/hr';

export interface InterviewStatusMeta {
  label: string;
  icon: string;
  color: string;
}

export const INTERVIEW_STATUS: Record<InterviewStatus, InterviewStatusMeta> = {
  PENDING: { label: 'პასუხის მოლოდინში', icon: 'schedule', color: '#f59e0b' },
  CONFIRMED: { label: 'დადასტურებული', icon: 'event_available', color: '#22c55e' },
  DECLINED: { label: 'უარი თქვა', icon: 'event_busy', color: '#ef4444' },
  RESCHEDULE_REQUESTED: { label: 'სხვა დრო ითხოვა', icon: 'update', color: '#8b5cf6' },
  CANCELLED: { label: 'გაუქმებული', icon: 'block', color: '#64748b' },
};

export const DURATIONS = [30, 45, 60, 90];
export const MAX_ALTERNATIVES = 3;

const DAYS = ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი'];
const DAYS_SHORT = ['კვი', 'ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ'];
const MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
const pad = (n: number) => String(n).padStart(2, '0');

// Shown in the viewer's time zone (Georgia for nearly everyone)
export const formatTime = (iso: string | Date) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "ხუთშაბათი, 30 ოქტომბერი" */
export const formatDay = (iso: string | Date) => {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** "ხუთ, 30 ოქტ · 14:00"; "დღეს" / "ხვალ" for the next two days */
export function formatShort(iso: string | Date, now = new Date()): string {
  const d = new Date(iso);
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  const day = dayDiff === 0 ? 'დღეს' : dayDiff === 1 ? 'ხვალ' : `${DAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  return `${day} · ${formatTime(d)}`;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Local "YYYY-MM-DD" / "HH:mm" for date and time inputs */
export const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Date + time inputs (local time) → ISO, or null if incomplete/invalid. */
export function fromInputs(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Next weekday at 11:00: a sensible default for a new interview. */
export function defaultInterviewStart(now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(11, 0, 0, 0);
  return d;
}

/**
 * The interview a card shows: the latest not-cancelled one that hasn't long passed.
 * Map from entry id, built once per interviews list.
 */
export function interviewsByEntry(interviews: HrInterview[], now = Date.now()): Map<number, HrInterview> {
  const map = new Map<number, HrInterview>();
  const recent = now - 12 * 3600 * 1000;
  for (const iv of interviews) {
    if (iv.status === 'CANCELLED' || new Date(iv.startsAt).getTime() < recent) continue;
    const current = map.get(iv.entryId);
    if (!current || iv.createdAt > current.createdAt) map.set(iv.entryId, iv);
  }
  return map;
}

/** Still ahead and not cancelled/declined: worth asking about when the card leaves the stage. */
export const isUpcoming = (iv: HrInterview, now = Date.now()) =>
  new Date(iv.startsAt).getTime() > now && (iv.status === 'PENDING' || iv.status === 'CONFIRMED' || iv.status === 'RESCHEDULE_REQUESTED');

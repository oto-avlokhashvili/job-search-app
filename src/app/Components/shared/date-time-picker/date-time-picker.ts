import { Component, computed, effect, input, model, signal, untracked } from '@angular/core';
import { SelectGroupInfo, SelectMenu, SelectOption } from '../select-menu/select-menu';

const DAY_MS = 86400000;
const WEEK = 7;
// How far ahead a date can be picked
const MAX_WEEKS = 26;
const DAYS_SHORT = ['კვი', 'ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ'];
const MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];

interface Day {
  date: Date;
  key: number;
  weekday: string;
  day: number;
  month: string;
  weekend: boolean;
  disabled: boolean;
}

interface TimeGroup {
  label: string;
  icon: string;
  slots: { minutes: number; label: string; disabled: boolean }[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const label = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/**
 * Date + time picker in the site's style (instead of the browser's date/time inputs, which look
 * different everywhere and show AM/PM in some locales). A week of days to page through, then
 * time slots every 30 minutes. `value` is an ISO string in the viewer's local time.
 */
@Component({
  selector: 'app-date-time-picker',
  imports: [SelectMenu],
  templateUrl: './date-time-picker.html',
  styleUrl: './date-time-picker.scss',
})
export class DateTimePicker {
  value = model<string | null>(null);
  /** Accent color (CSS color), e.g. the stage or answer color */
  accent = input('var(--primary)');

  /** Week shown, counted from this week */
  week = signal(0);
  private today = startOfDay(new Date());

  selected = computed(() => (this.value() ? new Date(this.value()!) : null));
  selectedDay = computed(() => (this.selected() ? startOfDay(this.selected()!).getTime() : null));
  selectedMinutes = computed(() => {
    const d = this.selected();
    return d ? d.getHours() * 60 + d.getMinutes() : null;
  });

  days = computed<Day[]>(() => {
    const first = this.today.getTime() + this.week() * WEEK * DAY_MS;
    return Array.from({ length: WEEK }, (_, i) => {
      // Built from parts, not ms arithmetic, so DST changes can't shift a day
      const base = new Date(first);
      const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      return {
        date,
        key: date.getTime(),
        weekday: DAYS_SHORT[date.getDay()],
        day: date.getDate(),
        month: MONTHS[date.getMonth()].slice(0, 3),
        weekend: date.getDay() === 0 || date.getDay() === 6,
        disabled: date.getTime() < this.today.getTime(),
      };
    });
  });
  monthLabel = computed(() => {
    const days = this.days();
    const a = days[0].date;
    const b = days[days.length - 1].date;
    return a.getMonth() === b.getMonth()
      ? `${MONTHS[a.getMonth()]} ${a.getFullYear()}`
      : `${MONTHS[a.getMonth()].slice(0, 3)} – ${MONTHS[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
  });
  canPrev = computed(() => this.week() > 0);
  canNext = computed(() => this.week() < MAX_WEEKS);

  timeGroups = computed<TimeGroup[]>(() => {
    const day = this.selectedDay();
    const now = new Date();
    const isToday = day === this.today.getTime();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const extra = this.selectedMinutes();
    const slot = (minutes: number) => ({ minutes, label: label(minutes), disabled: isToday && minutes <= nowMinutes });
    const group = (labelText: string, icon: string, from: number, to: number) => {
      const minutes = range(from, to, 30);
      // Off-grid selected time joins its group so it stays visible and selected
      if (extra !== null && extra >= from && extra <= to + 29 && !minutes.includes(extra)) {
        minutes.push(extra);
        minutes.sort((a, b) => a - b);
      }
      return { label: labelText, icon, slots: minutes.map(slot) };
    };
    return [
      group('დილა', 'wb_twilight', 8 * 60, 11 * 60 + 30),
      group('შუადღე', 'light_mode', 12 * 60, 16 * 60 + 30),
      group('საღამო', 'dark_mode', 17 * 60, 20 * 60),
    ];
  });

  // The same slots for the dropdown, grouped by part of day
  timeOptions = computed<SelectOption<number>[]>(() =>
    this.timeGroups().flatMap((g) => g.slots.map((s) => ({ value: s.minutes, label: s.label, disabled: s.disabled, group: g.label }))),
  );
  readonly timeGroupInfo: SelectGroupInfo[] = [
    { label: 'დილა', icon: 'wb_twilight' },
    { label: 'შუადღე', icon: 'light_mode' },
    { label: 'საღამო', icon: 'dark_mode' },
  ];

  constructor() {
    // Open on the week of the selected date
    effect(() => {
      const day = this.selectedDay();
      if (day === null) return;
      untracked(() => {
        const week = Math.floor(Math.round((day - this.today.getTime()) / DAY_MS) / WEEK);
        if (week >= 0 && week <= MAX_WEEKS && !this.days().some((d) => d.key === day)) this.week.set(week);
      });
    });
  }

  page(delta: number) {
    this.week.update((w) => Math.min(MAX_WEEKS, Math.max(0, w + delta)));
  }

  pickDay(day: Day) {
    if (day.disabled) return;
    // Keep the chosen time; the first pick defaults to 11:00
    const minutes = this.selectedMinutes() ?? 11 * 60;
    this.emit(day.date, minutes);
  }

  pickTime(minutes: number) {
    const day = this.selectedDay();
    this.emit(day !== null ? new Date(day) : this.days().find((d) => !d.disabled)!.date, minutes);
  }

  private emit(day: Date, minutes: number) {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
    this.value.set(d.toISOString());
  }
}

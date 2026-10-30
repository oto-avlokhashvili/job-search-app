import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BoardCard, HrInterview } from '../../../Core/Interfaces/hr';
import {
  formatDay,
  formatShort,
  formatTime,
  interviewStatusOf,
  MONTHS,
  needsNewTime,
  WEEKDAYS_MON,
} from '../../../Core/Utils/interview';
import { HrStore } from '../../../Store/hr.store';
import { GoogleCalendar } from '../../../Core/Services/google-calendar';
import { HrInterviewDialog } from '../hr-interview-dialog/hr-interview-dialog';

interface Row {
  interview: HrInterview;
  card: BoardCard | undefined;
  vacancy: string | null;
}

export interface CalendarCell {
  date: Date;
  key: number;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  weekend: boolean;
  rows: Row[];
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayKey = (iso: string | Date) => startOfDay(new Date(iso)).getTime();

// All interviews in one list (answers that need the HR first, then upcoming by day, then past)
// alongside a compact calendar on the right. A row opens the candidate on the board.
@Component({
  selector: 'app-hr-interviews',
  imports: [RouterLink, NgTemplateOutlet, HrInterviewDialog],
  templateUrl: './hr-interviews.html',
  styleUrl: './hr-interviews.scss',
})
export class HrInterviews implements OnInit {
  private hrStore = inject(HrStore);
  private googleCalendar = inject(GoogleCalendar);

  // Google account the Meet links are created in
  google = this.googleCalendar.connection;
  connectingGoogle = this.googleCalendar.connecting;
  googleError = signal('');
  copiedId = signal<number | null>(null);
  renewingId = signal<number | null>(null);
  // The candidate needs another time: the HR offers new ones right from the list, on the same link
  proposing = signal<Row | null>(null);

  readonly weekdays = WEEKDAYS_MON;
  private today = startOfDay(new Date());
  cursorMonth = signal(new Date(this.today.getFullYear(), this.today.getMonth(), 1));
  selectedDay = signal<number | null>(null);

  time = formatTime;
  short = (iso: string) => formatShort(iso);
  loading = computed(() => !this.hrStore.interviewsLoaded());

  private rows = computed<Row[]>(() => {
    const cards = new Map(this.hrStore.board().map((c) => [c.pipeline.id, c]));
    const titles = new Map(this.hrStore.vacancies().map((v) => [v.id, v.title]));
    return this.hrStore.interviews().map((interview) => ({
      interview,
      card: interview.entryId === null ? undefined : cards.get(interview.entryId),
      vacancy: interview.vacancyId ? (titles.get(interview.vacancyId) ?? null) : null,
    }));
  });

  // None of the offered times suited the candidate: the HR has to offer others
  needsAnswer = computed(() => this.rows().filter((r) => needsNewTime(r.interview) && this.isAhead(r.interview)));
  upcomingDays = computed(() => {
    const days = new Map<string, Row[]>();
    for (const row of this.rows()) {
      if (!this.isAhead(row.interview) || needsNewTime(row.interview)) continue;
      const day = formatDay(row.interview.startsAt);
      days.set(day, [...(days.get(day) ?? []), row]);
    }
    return [...days.entries()].map(([day, rows]) => ({ day, rows }));
  });
  past = computed(() =>
    this.rows()
      .filter((r) => !this.isAhead(r.interview))
      .reverse()
      .slice(0, 20),
  );
  empty = computed(() => !this.needsAnswer().length && !this.upcomingDays().length && !this.past().length);

  // ─── Calendar ──────────────────────────────────────────────────
  private rowsByDay = computed(() => {
    const map = new Map<number, Row[]>();
    for (const row of this.rows()) {
      if (row.interview.status === 'CANCELLED') continue;
      const k = dayKey(row.interview.startsAt);
      const list = map.get(k);
      if (list) list.push(row);
      else map.set(k, [row]);
    }
    return map;
  });

  monthLabel = computed(() => {
    const m = this.cursorMonth();
    return `${MONTHS[m.getMonth()]} ${m.getFullYear()}`;
  });

  calendarCells = computed<CalendarCell[]>(() => {
    const m = this.cursorMonth();
    const year = m.getFullYear();
    const month = m.getMonth();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7; // Monday = 0 … Sunday = 6
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const total = Math.ceil((offset + daysInMonth) / 7) * 7;
    const byDay = this.rowsByDay();
    const todayKey = this.today.getTime();

    return Array.from({ length: total }, (_, i) => {
      const date = new Date(year, month, 1 - offset + i);
      const key = date.getTime();
      const dow = date.getDay();
      return {
        date,
        key,
        day: date.getDate(),
        inMonth: date.getMonth() === month,
        isToday: key === todayKey,
        weekend: dow === 0 || dow === 6,
        rows: byDay.get(key) ?? [],
      };
    });
  });

  selectedCell = computed(() => {
    const sel = this.selectedDay();
    if (sel === null) return null;
    const date = new Date(sel);
    return {
      key: sel,
      label: formatDay(date),
      isPast: sel < this.today.getTime(),
      rows: this.rowsByDay().get(sel) ?? [],
    };
  });

  ngOnInit() {
    this.hrStore.loadInterviews(true);
    this.hrStore.loadBoard();
    this.hrStore.loadVacancies();
    this.googleCalendar.load();
  }

  stepMonth(delta: number) {
    const m = this.cursorMonth();
    this.cursorMonth.set(new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  goToday() {
    const t = startOfDay(new Date());
    this.cursorMonth.set(new Date(t.getFullYear(), t.getMonth(), 1));
    this.selectedDay.set(t.getTime());
  }

  selectCell(cell: CalendarCell) {
    this.selectedDay.update((cur) => (cur === cell.key ? null : cell.key));
    if (!cell.inMonth) {
      this.cursorMonth.set(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1));
    }
  }

  clearDay() {
    this.selectedDay.set(null);
  }

  async connectGoogle() {
    this.googleError.set('');
    const result = await this.googleCalendar.connect();
    if (!result.ok && result.error) this.googleError.set(result.error);
  }

  async disconnectGoogle() {
    this.googleError.set('');
    try {
      await this.googleCalendar.disconnect();
    } catch {
      this.googleError.set('გათიშვა ვერ მოხერხდა');
    }
  }

  statusOf(row: Row) {
    return interviewStatusOf(row.interview);
  }

  name(row: Row) {
    if (this.isInvite(row)) return row.interview.inviteeName || 'მოწვევის ბმული';
    return row.card?.contact?.fullName || row.interview.inviteeName || row.card?.detectedRole || 'კანდიდატი';
  }

  /** Invitation not accepted yet: the candidate has no card, only the link */
  isInvite(row: Row) {
    return row.interview.entryId === null;
  }

  /** The invitation link's day ran out before anyone used it */
  isExpired(row: Row) {
    const until = row.interview.inviteExpiresAt;
    return this.isInvite(row) && !!until && new Date(until).getTime() <= Date.now();
  }

  /** The candidate needs another time and it's not over yet: the HR's move (older answers with own proposals go to the card) */
  wantsNewTime(row: Row) {
    return needsNewTime(row.interview) && !row.interview.proposedTimes.length && this.isAhead(row.interview);
  }

  /** New times saved: emailed to the candidate when there's an address, otherwise the link is copied to resend */
  async onProposed(saved: HrInterview) {
    const row = this.proposing();
    this.proposing.set(null);
    if (row && !saved.sentTo) await this.copyLink({ ...row, interview: saved });
  }

  /** Under an invitation: until when the link works; claimed (asked for another time), whose it is */
  inviteState(row: Row) {
    const iv = row.interview;
    if (!iv.inviteExpiresAt) return iv.inviteeEmail ?? '';
    return this.isExpired(row) ? 'ბმულს ვადა გაუვიდა' : `ბმული მოქმედებს ${formatShort(iv.inviteExpiresAt)}-მდე`;
  }

  /** A new link for another day; the old one stops working */
  async renewLink(row: Row) {
    if (this.renewingId()) return;
    this.renewingId.set(row.interview.id);
    try {
      const saved = await this.hrStore.updateInterview(row.interview.id, { renewLink: true });
      await this.copyLink({ ...row, interview: saved });
    } catch {
      this.googleError.set('ახალი ბმულის შექმნა ვერ მოხერხდა');
    } finally {
      this.renewingId.set(null);
    }
  }

  async copyLink(row: Row) {
    try {
      await navigator.clipboard.writeText(row.interview.link);
      this.copiedId.set(row.interview.id);
      setTimeout(() => this.copiedId.set(null), 2000);
    } catch {
      window.prompt('მოწვევის ბმული', row.interview.link);
    }
  }

  /** The board the interview's card is on, with the card opened */
  boardLink(row: Row) {
    return row.interview.vacancyId ? ['/hr/candidates/v', row.interview.vacancyId] : ['/hr/candidates'];
  }

  isAhead(iv: HrInterview) {
    return new Date(iv.startsAt).getTime() + iv.durationMin * 60000 > Date.now();
  }
}

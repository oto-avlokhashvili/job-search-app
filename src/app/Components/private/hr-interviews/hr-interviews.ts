import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BoardCard, HrInterview } from '../../../Core/Interfaces/hr';
import { formatDay, formatShort, formatTime, interviewStatusOf, needsNewTime } from '../../../Core/Utils/interview';
import { HrStore } from '../../../Store/hr.store';
import { GoogleCalendar } from '../../../Core/Services/google-calendar';

interface Row {
  interview: HrInterview;
  card: BoardCard | undefined;
  vacancy: string | null;
}

// All interviews in one list: answers that need the HR first, then upcoming by day, then the past week.
// A row opens the candidate on the board.
@Component({
  selector: 'app-hr-interviews',
  imports: [RouterLink, NgTemplateOutlet],
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

  ngOnInit() {
    this.hrStore.loadInterviews(true);
    this.hrStore.loadBoard();
    this.hrStore.loadVacancies();
    this.googleCalendar.load();
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

  inviteValidUntil(row: Row) {
    const until = row.interview.inviteExpiresAt;
    return until ? `${formatShort(until)}-მდე` : '';
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

  private isAhead(iv: HrInterview) {
    return new Date(iv.startsAt).getTime() + iv.durationMin * 60000 > Date.now();
  }
}

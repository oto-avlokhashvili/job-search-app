import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BoardCard, HrInterview } from '../../../Core/Interfaces/hr';
import { formatDay, formatShort, formatTime, INTERVIEW_STATUS } from '../../../Core/Utils/interview';
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

  time = formatTime;
  short = (iso: string) => formatShort(iso);
  loading = computed(() => !this.hrStore.interviewsLoaded());

  private rows = computed<Row[]>(() => {
    const cards = new Map(this.hrStore.board().map((c) => [c.pipeline.id, c]));
    const titles = new Map(this.hrStore.vacancies().map((v) => [v.id, v.title]));
    return this.hrStore.interviews().map((interview) => ({
      interview,
      card: cards.get(interview.entryId),
      vacancy: interview.vacancyId ? (titles.get(interview.vacancyId) ?? null) : null,
    }));
  });

  // The candidate asked for another time: the HR has to pick one
  needsAnswer = computed(() =>
    this.rows().filter((r) => r.interview.status === 'RESCHEDULE_REQUESTED' && this.isAhead(r.interview)),
  );
  upcomingDays = computed(() => {
    const days = new Map<string, Row[]>();
    for (const row of this.rows()) {
      if (!this.isAhead(row.interview) || row.interview.status === 'RESCHEDULE_REQUESTED') continue;
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
    return INTERVIEW_STATUS[row.interview.status];
  }

  name(row: Row) {
    return row.card?.contact?.fullName || row.card?.detectedRole || 'კანდიდატი';
  }

  /** The board the interview's card is on, with the card opened */
  boardLink(row: Row) {
    return row.interview.vacancyId ? ['/hr/candidates/v', row.interview.vacancyId] : ['/hr/candidates'];
  }

  private isAhead(iv: HrInterview) {
    return new Date(iv.startsAt).getTime() + iv.durationMin * 60000 > Date.now();
  }
}

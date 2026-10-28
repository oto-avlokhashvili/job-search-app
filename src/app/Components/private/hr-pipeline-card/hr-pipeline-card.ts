import { Component, computed, input, output } from '@angular/core';
import { HrCandidate, HrInterview, PipelineStage } from '../../../Core/Interfaces/hr';
import { formatShort, INTERVIEW_STATUS } from '../../../Core/Utils/interview';
import { pipelineOf, STAGE_BY_ID } from '../../../Core/Utils/pipeline';
import { HrStageMenu } from '../hr-stage-menu/hr-stage-menu';

// Compact candidate card for a board column. The stage menu is the non-drag way to move it (phones, keyboard).
@Component({
  selector: 'app-hr-pipeline-card',
  imports: [HrStageMenu],
  templateUrl: './hr-pipeline-card.html',
  styleUrl: './hr-pipeline-card.scss',
})
export class HrPipelineCard {
  candidate = input.required<HrCandidate>();
  /** Main board: which vacancy this card belongs to. */
  vacancyLabel = input<string | null>(null);
  /** Scheduled interview: time and the candidate's answer */
  interview = input<HrInterview | null>(null);
  open = output<HrCandidate>();
  stageChange = output<PipelineStage>();

  pipeline = computed(() => pipelineOf(this.candidate()));
  interviewBadge = computed(() => {
    const iv = this.interview();
    return iv ? { ...INTERVIEW_STATUS[iv.status], when: formatShort(iv.startsAt) } : null;
  });
  stage = computed(() => STAGE_BY_ID[this.pipeline().stage]);
  initials = computed(() => {
    const c = this.candidate();
    const words = (c.contact?.fullName || c.detectedRole || '?').trim().split(/\s+/);
    return words
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  });
  skills = computed(() => this.candidate().primarySkills.slice(0, 4));
  visibleTags = computed(() => this.pipeline().tags.slice(0, 2));
  hiddenTags = computed(() => this.pipeline().tags.length - this.visibleTags().length);
}

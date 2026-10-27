import { HrCandidate, PipelineChange, PipelineStage, PipelineState } from '../Interfaces/hr';

export interface StageMeta {
  id: PipelineStage;
  label: string;
  icon: string;
  color: string;
}

// Board columns, left to right.
export const PIPELINE_STAGES: StageMeta[] = [
  { id: 'SOURCED', label: 'ახალი', icon: 'person_search', color: '#3b82f6' },
  { id: 'CONTACTED', label: 'დაკავშირებული', icon: 'call', color: '#8b5cf6' },
  { id: 'INTERVIEW', label: 'გასაუბრება', icon: 'forum', color: '#f59e0b' },
  { id: 'OFFER', label: 'შეთავაზება', icon: 'handshake', color: '#06b6d4' },
  { id: 'HIRED', label: 'აყვანილი', icon: 'verified', color: '#22c55e' },
  { id: 'REJECTED', label: 'უარყოფილი', icon: 'block', color: '#64748b' },
];

export const STAGE_BY_ID = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.id, s])) as Record<PipelineStage, StageMeta>;

// Final stages: shown as drop zones above the board instead of columns.
export const OUTCOME_STAGES: PipelineStage[] = ['HIRED', 'REJECTED'];

export const REJECTION_REASONS = ['არ შეესაბამება მოთხოვნებს', 'უარი თქვა კანდიდატმა', 'ხელფასი არ შეთანხმდა'];

export const MAX_TAGS = 10;

export const DEFAULT_PIPELINE: PipelineState = {
  id: 0,
  vacancyId: null,
  stage: 'SOURCED',
  rejectionReason: null,
  rating: null,
  tags: [],
  position: null,
};

export const pipelineOf = (c: HrCandidate): PipelineState => c.pipeline ?? DEFAULT_PIPELINE;

/** Client copy of the server rules, for instant feedback: the reason lives only on REJECTED. */
export function applyChange(current: PipelineState, change: PipelineChange): PipelineState {
  const next = { ...current };
  if (change.stage !== undefined && change.stage !== current.stage) {
    next.stage = change.stage;
    next.rejectionReason = change.stage === 'REJECTED' ? change.rejectionReason?.trim() || null : null;
  } else if (change.rejectionReason !== undefined && next.stage === 'REJECTED') {
    next.rejectionReason = change.rejectionReason?.trim() || null;
  }
  if (change.rating !== undefined) next.rating = change.rating;
  if (change.tags !== undefined) next.tags = change.tags;
  return next;
}

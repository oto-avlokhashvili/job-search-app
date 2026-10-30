import { User } from './user';

export type SeniorityLevel = 'Junior' | 'Mid' | 'Senior' | 'Lead' | 'Principal';

export interface CandidateContact {
  fullName: string | null;
  email: string | null;
  phoneNumber: string | null;
}

/** Anonymized CV card; contact is filled in once this HR has unlocked the CV. */
export interface HrCandidate {
  id: number;
  detectedRole: string;
  seniorityLevel: string;
  careerDirection: string;
  primarySkills: string[];
  secondarySkills: string[];
  domains: string[];
  locationPreference: string;
  updatedAt: string;
  match?: number;
  matchedKeywords?: string[];
  unlocked: boolean;
  contact: CandidateContact | null;
  /** This HR's vacancies the CV is in (unlocked CVs only). */
  vacancies?: VacancyMembership[];
  /** Board card state; only on "My candidates". A CV in two vacancies gives two cards. */
  pipeline?: PipelineState;
  /** Added by hand by this HR: name and position only, no CV file or AI summary */
  manual?: boolean;
}

/** A card on the boards: one CV in one vacancy (or in none). */
export type BoardCard = HrCandidate & { pipeline: PipelineState };

export interface VacancyMembership {
  entryId: number;
  vacancyId: number;
  stage: PipelineStage;
}

export type VacancyStatus = 'OPEN' | 'CLOSED';

/** The HR's own hiring position; each has its own board. */
export interface HrVacancy {
  id: number;
  title: string;
  status: VacancyStatus;
  createdAt: string;
  updatedAt: string;
  /** Server counts at load time; the sidebar counts from the board once it's loaded. */
  total: number;
  stages: Partial<Record<PipelineStage, number>>;
}

export type PipelineStage = 'SOURCED' | 'CONTACTED' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';

export interface PipelineState {
  /** Board entry id: identifies the card (a CV can have several). */
  id: number;
  vacancyId: number | null;
  stage: PipelineStage;
  rejectionReason: string | null;
  rating: number | null;
  tags: string[];
  position: number | null;
}

/** Fields to change; null clears rating / rejection reason. */
export interface PipelineChange {
  stage?: PipelineStage;
  rejectionReason?: string | null;
  rating?: number | null;
  tags?: string[];
}

export type InterviewEventKind =
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_UPDATED'
  | 'INTERVIEW_CONFIRMED'
  | 'INTERVIEW_DECLINED'
  | 'INTERVIEW_RESCHEDULE_REQUESTED'
  | 'INTERVIEW_CANCELLED';

export interface CandidateActivity {
  id: string;
  kind: 'NOTE' | 'STAGE_CHANGED' | 'RATING_CHANGED' | InterviewEventKind;
  createdAt: string;
  author: { id: number; name: string };
  noteId?: number;
  body?: string;
  /** Board the change was made on (null = no vacancy). */
  vacancyId?: number | null;
  fromStage?: PipelineStage | null;
  toStage?: PipelineStage | null;
  rejectionReason?: string | null;
  rating?: number | null;
  /** Interview events: the interview time then, and the candidate's note */
  interviewAt?: string | null;
  note?: string | null;
}

export type InterviewFormat = 'ONLINE' | 'ONSITE';
export type InterviewStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'RESCHEDULE_REQUESTED' | 'CANCELLED';

/** An interview scheduled for a board card (entryId). */
export interface HrInterview {
  id: number;
  /** Null while an invited candidate hasn't joined yet (no card) */
  entryId: number | null;
  cvId: number | null;
  vacancyId: number | null;
  /** Invitation to someone not on the platform yet: who joined through it (null until then) */
  inviteeName: string | null;
  inviteeEmail: string | null;
  /** Invitation link nobody joined through yet: works until then (one person) */
  inviteExpiresAt: string | null;
  /** Set on invitations: the position the HR invited for */
  position: string | null;
  startsAt: string;
  durationMin: number;
  format: InterviewFormat;
  location: string;
  message: string | null;
  alternatives: string[];
  status: InterviewStatus;
  candidateNote: string | null;
  /** Declined because none of the offered times suits them: worth offering others */
  timeConflict: boolean;
  /** Older answers only: times the candidate proposed */
  proposedTimes: string[];
  /** Null when saved without emailing the candidate */
  sentTo: string | null;
  respondedAt: string | null;
  createdAt: string;
  /** `location` is a Google Meet link generated in the HR's calendar */
  googleMeet: boolean;
  /** The candidate's answer page */
  link: string;
}

export interface InterviewDraft {
  startsAt: string;
  durationMin: number;
  format: InterviewFormat;
  location: string;
  message: string;
  alternatives: string[];
  /** Online: generate a Google Meet link (location is then ignored). Left out on edit: keep what there is. */
  googleMeet?: boolean;
}

/** The Google account an HR connected for Meet links. */
export interface GoogleConnection {
  connected: boolean;
  email: string | null;
}

/** What the candidate's answer page gets (no sign-in, the link is the key). */
export interface PublicInterview {
  status: InterviewStatus;
  startsAt: string;
  durationMin: number;
  format: InterviewFormat;
  location: string;
  message: string | null;
  alternatives: { slot: number; startsAt: string }[];
  proposedTimes: string[];
  candidateNote: string | null;
  timeConflict: boolean;
  position: string;
  company: string;
  hrName: string;
  candidateName: string;
  canRespond: boolean;
  /** Invited, not on the platform yet: accepting asks for details and a CV */
  needsProfile: boolean;
  /** The invitation link's day ran out before anyone joined */
  inviteExpired: boolean;
  /** Prefill: who asked for other times, and where the invitation went */
  inviteeName: string | null;
  inviteeEmail: string | null;
}

/** An invitation link for one new candidate: the interview plus the vacancy board they join. */
export interface InviteDraft extends InterviewDraft {
  vacancyId?: number;
  /** Required without a vacancy; with one it defaults to the vacancy's title */
  position?: string;
}

/** A candidate the HR adds by hand: no CV, only on their boards. */
export interface ManualCandidateDraft {
  firstName: string;
  lastName: string;
  position: string;
  /** Also on this vacancy's board; omitted: the main board only */
  vacancyId?: number;
}

/** An invitee's details sent with their acceptance (with the CV file). */
export interface InterviewJoin {
  action: 'confirm';
  slot?: number;
  fullName: string;
  email: string;
  phoneNumber: string;
}

export interface InterviewAnswer {
  action: 'confirm' | 'reschedule' | 'decline';
  /** confirm: one of the HR's alternative times instead of the main one */
  slot?: number;
  /** decline: the reason; reschedule: when it would suit */
  note?: string;
  /** decline (older answers): none of the offered times suits; now that's "reschedule" */
  timeConflict?: boolean;
  /** reschedule, invitee not on the platform yet: where the new times are emailed */
  fullName?: string;
  email?: string;
}

export interface HrCvSearchParams {
  keyword: string;
  location?: string;
  seniority?: SeniorityLevel | '';
  page?: number;
  limit?: number;
}

export interface HrCvSearchResult {
  total: number;
  page: number;
  limit: number;
  candidates: HrCandidate[];
}

export interface LinkedinProfile {
  name: string;
  headline: string | null;
  url: string;
  snippet: string;
}

export interface LinkedinSearchResult {
  query: string;
  page: number;
  count: number;
  profiles: LinkedinProfile[];
  cached: boolean;
}

export interface HrUsage {
  cvUnlocks: { used: number; limit: number };
  linkedinSearches: { used: number; limit: number };
  unlimited: boolean;
}

export interface HrRegistration {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName: string;
}

export type HrAccount = Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'companyName' | 'hrApproved' | 'isEmailVerified' | 'createdAt'>;

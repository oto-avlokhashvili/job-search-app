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

export interface CandidateActivity {
  id: string;
  kind: 'NOTE' | 'STAGE_CHANGED' | 'RATING_CHANGED';
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

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

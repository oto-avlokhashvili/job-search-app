export type UserRole = 'USER' | 'ADMIN';

export type SubscriptionPlan = 'BASIC' | 'PRO';

export type SubscriptionStatus = 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

export interface SubscriptionDetails {
  id: string;
  userId: number;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role?: UserRole;
  subscriptionDetails?: SubscriptionDetails | null;
  subscription?: string | null;
  createdAt: string;
  searchQuery: string[];
  telegramChatId?: string;
  isEmailVerified?: boolean;
  receiveMessages?: boolean;
  detectedRole?: string;
}

export interface UserRegistration {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

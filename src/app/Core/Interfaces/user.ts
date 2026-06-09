export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  subscription: 'BASIC' | 'PREMIUM' | 'PRO';
  createdAt: string;
  searchQuery: string[];
  telegramChatId?:string;
  isEmailVerified?: boolean;
}

export interface UserRegistration {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  subscription: 'BASIC' | 'PREMIUM' | 'PRO';
  createdAt: string;
  searchQuery: string[];
  telegramChatId?:string
}

export interface UserRegistration {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  subscription: 'BASIC' | 'PREMIUM' | 'PRO';
  createdAt: string;
  searchQuery: string;
}

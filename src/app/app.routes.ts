import { Routes } from '@angular/router';
import { Home } from './Components/public/home/home';
import { Auth } from './Components/public/auth/auth';

export const routes: Routes = [
  {
    path: '',
    component: Home,
  },
  {
    path: 'auth',
    component: Auth,
  }
];

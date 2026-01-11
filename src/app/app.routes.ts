import { Routes } from '@angular/router';
import { Home } from './Components/public/home/home';
import { Auth } from './Components/public/auth/auth';
import { HomeComponent } from './Components/private/home/home';

export const routes: Routes = [
  {
    path: 'landing',
    component: Home,
  },
  {
    path: 'auth',
    component: Auth,
  },
  {
    path: 'home',
    component: HomeComponent,
  }
];

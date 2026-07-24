import { Routes } from '@angular/router';
import { Home } from './Components/public/home/home';
import { PrivateLayout } from './Components/private/private-layout/private-layout';
import { Dashboard } from './Components/private/dashboard/dashboard';
import { Profile } from './Components/private/profile/profile';
import { SentJobs } from './Components/private/sent-jobs/sent-jobs';
import { Analytics } from './Components/private/analytics/analytics';
import { authGuard } from './Core/Guards/auth-guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home',
  },
  {
    path: 'home',
    component: Home,
    data: { showHeroSection: true }
  },
  {
    path: 'auth',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'private',
    component: PrivateLayout,
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      {
        path: 'dashboard',
        component: Dashboard,
      },
      {
        path: 'dashboard/:id',
        component: Dashboard,
      },
      {
        path: 'chat',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'chat/:id',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'profile',
        component: Profile,
      },
      {
        path: 'jobs',
        component: SentJobs,
      },
      {
        path: 'analytics',
        component: Analytics,
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  }
];
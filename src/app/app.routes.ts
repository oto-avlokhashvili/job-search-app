import { Routes } from '@angular/router';
import { Home } from './Components/public/home/home';
import { PrivateLayout } from './Components/private/private-layout/private-layout'
import { Dashboard } from './Components/private/dashboard/dashboard';
import { Profile } from './Components/private/profile/profile';
import { SentJobs } from './Components/private/sent-jobs/sent-jobs';
import { Analytics } from './Components/private/analytics/analytics';
import { Chat } from './Components/private/chat/chat';
import { authGuard } from './Core/Guards/auth-guard';
import { SearchJobs } from './Components/public/search-jobs/search-jobs';

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
    path: 'jobs',
    component: SearchJobs,
    data: { showHeroSection: false }
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
        path: 'chat',
        component: Chat,
      },

      {
        path: '',
        redirectTo: 'chat',
        pathMatch: 'full'
      }
    ]
  }
];
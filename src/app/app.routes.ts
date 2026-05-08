import { Routes } from '@angular/router';
import { Home } from './Components/public/home/home';
import { PrivateLayout } from './Components/private/private-layout/private-layout'
import { Auth } from './Components/public/auth/auth';
import { Dashboard } from './Components/private/dashboard/dashboard';
import { Profile } from './Components/private/profile/profile';
import { SentJobs } from './Components/private/sent-jobs/sent-jobs';
import { Analytics } from './Components/private/analytics/analytics';
import { Chat } from './Components/private/chat/chat';
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
    component: Auth,
    data: { hideLayout: true }
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
        data: { hideLayout: true },
      },
      {
        path: 'profile',
        component: Profile,
        data: { hideLayout: true },
      },
      {
        path: 'jobs',
        component: SentJobs,
        data: { hideLayout: true },
      },
      {
        path: 'analytics',
        component: Analytics,
        data: { hideLayout: true },
      },
      {
        path: 'chat',
        component: Chat,
        data: { hideLayout: true, hideFooterAndHeader: true },
      },
      {
        path: 'chat/:id',
        component: Chat,
        data: { hideLayout: true, hideFooterAndHeader: true },
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  }
];
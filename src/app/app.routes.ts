import { Routes } from '@angular/router';
import { Home } from './Components/public/home/home';
import { PrivateLayout } from './Components/private/private-layout/private-layout';
import { Dashboard } from './Components/private/dashboard/dashboard';
import { Profile } from './Components/private/profile/profile';
import { SentJobs } from './Components/private/sent-jobs/sent-jobs';
import { Analytics } from './Components/private/analytics/analytics';
import { authGuard } from './Core/Guards/auth-guard';
import { onboardingGuard, onboardingPageGuard } from './Core/Guards/onboarding.guard';
import { proGuard } from './Core/Guards/pro.guard';

import { Onboarding } from './Components/private/onboarding/onboarding';

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
    data: { hideFooter: true },
    children: [
      {
        path: 'dashboard',
        component: Dashboard,
        canActivate: [onboardingGuard, proGuard],
      },
      {
        path: 'dashboard/:id',
        component: Dashboard,
        canActivate: [onboardingGuard, proGuard],
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
        path: 'onboarding',
        component: Onboarding,
        canActivate: [onboardingPageGuard],
      },
      {
        path: 'profile',
        component: Profile,
        canActivate: [onboardingGuard],
      },
      {
        path: 'notifications',
        component: SentJobs,
        canActivate: [onboardingGuard],
      },
      {
        path: 'jobs',
        redirectTo: 'notifications',
        pathMatch: 'full'
      },
      {
        path: 'analytics',
        component: Analytics,
        canActivate: [onboardingGuard],
      },
      {
        path: '',
        redirectTo: 'profile',
        pathMatch: 'full'
      }
    ]
  }
];
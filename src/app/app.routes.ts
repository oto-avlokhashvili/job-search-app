import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home',
  },
  {
    path: 'home',
    loadComponent: () => import('./Components/public/home/home').then(m => m.Home),
    data: { showHeroSection: true }
  },
  {
    path: 'auth',
    loadComponent: () => import('./Components/public/auth/auth').then(m => m.Auth),
    data: { hideLayout: true }
  },
  {
    path: 'private',
    loadComponent: () => import('./Components/private/private-layout/private-layout').then(m => m.PrivateLayout),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./Components/private/dashboard/dashboard').then(m => m.Dashboard),
        data: { hideLayout: true },
      },
      {
        path: 'profile',
        loadComponent: () => import('./Components/private/profile/profile').then(m => m.Profile),
        data: { hideLayout: true },
      },
      {
        path: 'jobs',
        loadComponent: () => import('./Components/private/sent-jobs/sent-jobs').then(m => m.SentJobs),
        data: { hideLayout: true },
      },
      {
        path: 'analytics',
        loadComponent: () => import('./Components/private/analytics/analytics').then(m => m.Analytics),
        data: { hideLayout: true },
      },
      {
        path: 'chat',
        loadComponent: () => import('./Components/private/chat/chat').then(m => m.Chat),
        data: { hideLayout: true, hideFooterAndHeader: true },
      },
      {
        path: 'chat/:id',
        loadComponent: () => import('./Components/private/chat/chat').then(m => m.Chat),
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
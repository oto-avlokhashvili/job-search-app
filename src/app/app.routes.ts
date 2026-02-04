import { Routes } from '@angular/router';
import { Home } from './Components/public/home/home';
import { Auth } from './Components/public/auth/auth';
import { PrivateLayout } from './Components/private/private-layout/private-layout';
import { Dashboard } from './Components/private/dashboard/dashboard';
import { Profile } from './Components/private/profile/profile';
import { SentJobs } from './Components/private/sent-jobs/sent-jobs';

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
    component:  PrivateLayout,
    children: [
    {
      path: 'dashboard',
      component: Dashboard,
      data: { showHeroSection: true, hideLayout: true  },

    },
    {
      path: 'profile',
      component: Profile,
      data: { showHeroSection: true, hideLayout: true  },
    },
    {
      path: 'jobs',
      component: SentJobs,
      data: { showHeroSection: true, hideLayout: true  },
    },
    {
      path: '',
      redirectTo: 'dashboard',
      pathMatch: 'full'
    }
  ]
  }
];

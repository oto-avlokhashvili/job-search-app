import { Routes } from '@angular/router';
import { Home } from './Components/public/home/home';
import { Auth } from './Components/public/auth/auth';
import { HomeComponent } from './Components/private/home/home';
import { PrivateLayout } from './Components/private/private-layout/private-layout';
import { Dashboard } from './Components/private/dashboard/dashboard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: '',
  },
  {
    path: '',
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
      path: '',
      redirectTo: 'dashboard',
      pathMatch: 'full'
    }
  ]
  }
];

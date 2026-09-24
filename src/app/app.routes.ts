import { Routes, UrlMatcher, UrlSegment } from '@angular/router';
import { authGuard } from './Core/Guards/auth-guard';
import { onboardingGuard, onboardingPageGuard } from './Core/Guards/onboarding.guard';
import { proGuard } from './Core/Guards/pro.guard';

import { VacancyDetails } from './Components/public/vacancy-details/vacancy-details';
import { Vacancies } from './Components/public/vacancies/vacancies';
import { VacancyLanding } from './Components/public/vacancy-landing/vacancy-landing';
import { getLandingPage } from './Core/Utils/landing-pages';

// /vacancies/tbilisi, /vacancies/it, ... → SEO landing page; any other /vacancies/:slug is a job.
const landingPageMatcher: UrlMatcher = (segments: UrlSegment[]) =>
  segments.length === 2 && segments[0].path === 'vacancies' && getLandingPage(segments[1].path)
    ? { consumed: segments, posParams: { slug: segments[1] } }
    : null;

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'vacancies',
  },
  {
    path: 'home',
    loadComponent: () => import('./Components/public/home/home').then((m) => m.Home),
    data: { showHeroSection: true }
  },
  {
    path: 'vacancies',
    component: Vacancies,
  },
  {
    matcher: landingPageMatcher,
    component: VacancyLanding,
  },
  {
    path: 'vacancies/:slug',
    component: VacancyDetails,
  },
  {
    path: 'home/vacancies/:slug',
    redirectTo: 'vacancies/:slug',
    pathMatch: 'full'
  },
  {
    path: 'home/vacancies',
    redirectTo: 'vacancies',
    pathMatch: 'full'
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('./Components/public/privacy-policy/privacy-policy').then((m) => m.PrivacyPolicy),
  },
  {
    path: 'privacy-policy',
    redirectTo: 'privacy',
    pathMatch: 'full'
  },
  {
    path: 'terms',
    loadComponent: () =>
      import('./Components/public/terms-and-conditions/terms-and-conditions').then((m) => m.TermsAndConditions),
  },
  {
    path: 'terms-and-conditions',
    redirectTo: 'terms',
    pathMatch: 'full'
  },
  {
    path: 'auth',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'private',
    // Private area is lazy-loaded so anonymous visitors (and crawlers) never download it.
    loadComponent: () =>
      import('./Components/private/private-layout/private-layout').then((m) => m.PrivateLayout),
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    data: { hideFooter: true },
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./Components/private/dashboard/dashboard').then((m) => m.Dashboard),
        canActivate: [onboardingGuard, proGuard],
      },
      {
        path: 'dashboard/:id',
        loadComponent: () => import('./Components/private/dashboard/dashboard').then((m) => m.Dashboard),
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
        loadComponent: () => import('./Components/private/onboarding/onboarding').then((m) => m.Onboarding),
        canActivate: [onboardingPageGuard],
      },
      {
        path: 'profile',
        loadComponent: () => import('./Components/private/profile/profile').then((m) => m.Profile),
        canActivate: [onboardingGuard],
      },
      {
        path: 'notifications',
        loadComponent: () => import('./Components/private/sent-jobs/sent-jobs').then((m) => m.SentJobs),
        canActivate: [onboardingGuard],
      },
      {
        path: 'jobs',
        redirectTo: 'notifications',
        pathMatch: 'full'
      },
      {
        path: 'analytics',
        loadComponent: () => import('./Components/private/analytics/analytics').then((m) => m.Analytics),
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
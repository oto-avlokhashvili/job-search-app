import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes, UrlMatcher, UrlSegment } from '@angular/router';
import { authGuard } from './Core/Guards/auth-guard';
import { hrGuard } from './Core/Guards/hr-guard';

import { VacancyDetails } from './Components/public/vacancy-details/vacancy-details';
import { Vacancies } from './Components/public/vacancies/vacancies';
import { VacancyLanding } from './Components/public/vacancy-landing/vacancy-landing';
import { getLandingPage } from './Core/Utils/landing-pages';

// /vacancies/tbilisi, /vacancies/it, ... → SEO landing page; any other /vacancies/:slug is a job.
const landingPageMatcher: UrlMatcher = (segments: UrlSegment[]) =>
  segments.length === 2 && segments[0].path === 'vacancies' && getLandingPage(segments[1].path)
    ? { consumed: segments, posParams: { slug: segments[1] } }
    : null;

// Old notifications URLs land on the profile (history accordion stays closed). Keeps incoming
// query params (e.g. ?token= from the Google login redirect).
const toProfileNotifications: RedirectFunction = ({ queryParams }) =>
  inject(Router).createUrlTree(['/profile'], { queryParams });

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
    path: 'about',
    loadComponent: () => import('./Components/public/about/about').then((m) => m.About),
  },
  {
    path: 'contact',
    loadComponent: () => import('./Components/public/contact/contact').then((m) => m.Contact),
  },
  // Candidate's answer to an interview invitation (link from the email; no sign-in)
  {
    path: 'interview/:token',
    loadComponent: () => import('./Components/public/interview-answer/interview-answer').then((m) => m.InterviewAnswer),
    data: { hideFooter: true },
  },
  {
    path: 'auth',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  // Account pages: sign-in only. Lazy-loaded so anonymous visitors (and crawlers) never download them.
  {
    path: 'profile',
    loadComponent: () => import('./Components/public/profile/profile').then((m) => m.Profile),
    canActivate: [authGuard],
    data: { hideFooter: true },
  },
  // Sent jobs now live in a profile accordion; old links open it.
  { path: 'notifications', redirectTo: toProfileNotifications, pathMatch: 'full' },
  {
    path: 'analytics',
    loadComponent: () => import('./Components/public/analytics/analytics').then((m) => m.Analytics),
    canActivate: [authGuard],
    data: { hideFooter: true },
  },
  // HR area: private layout (own sidebar, no public header/footer). hrGuard checks role + admin approval.
  {
    path: 'hr',
    loadComponent: () => import('./Components/private/private-layout/private-layout').then((m) => m.PrivateLayout),
    canActivate: [authGuard],
    canActivateChild: [hrGuard],
    data: { hideLayout: true },
    children: [
      { path: '', redirectTo: 'search', pathMatch: 'full' },
      {
        path: 'search',
        loadComponent: () => import('./Components/private/hr-search/hr-search').then((m) => m.HrSearch),
      },
      {
        path: 'candidates',
        loadComponent: () => import('./Components/private/hr-candidates/hr-candidates').then((m) => m.HrCandidates),
        data: { wideContent: true },
      },
      {
        path: 'interviews',
        loadComponent: () => import('./Components/private/hr-interviews/hr-interviews').then((m) => m.HrInterviews),
      },
      // One vacancy's board: same page, filtered
      {
        path: 'candidates/v/:vacancyId',
        loadComponent: () => import('./Components/private/hr-candidates/hr-candidates').then((m) => m.HrCandidates),
        data: { wideContent: true },
      },
      {
        path: 'admin',
        loadComponent: () => import('./Components/private/hr-admin/hr-admin').then((m) => m.HrAdmin),
        data: { adminOnly: true },
      },
      {
        path: 'pending',
        loadComponent: () => import('./Components/private/hr-pending/hr-pending').then((m) => m.HrPending),
      },
    ],
  },
  // Old /private/* URLs (bookmarks, emails, Telegram, the Google login redirect with ?token=).
  // String redirects keep the query params, so the token reaches authGuard.
  { path: 'private/notifications', redirectTo: toProfileNotifications, pathMatch: 'full' },
  { path: 'private/jobs', redirectTo: toProfileNotifications, pathMatch: 'full' },
  { path: 'private/analytics', redirectTo: 'analytics', pathMatch: 'full' },
  { path: 'private', redirectTo: 'profile', pathMatch: 'full' },
  { path: 'private/**', redirectTo: 'profile' },
];
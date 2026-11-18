import { inject } from '@angular/core';
import { CanActivateFn, RedirectFunction, Router, Routes } from '@angular/router';
import { authGuard } from './Core/Guards/auth-guard';
import { hrGuard } from './Core/Guards/hr-guard';

import { getLandingPage, landingSearchParams } from './Core/Utils/landing-pages';
import { extractJobIdFromSlug } from './Core/Utils/slug-generator';
import { JOB_MODAL_PARAM } from './Core/Services/job-modal.service';

// /vacancies/tbilisi, /vacancies/it, ... → the home search with that keyword's filters.
// /vacancies/<title>-123 → /home?job=123 (the vacancy opens in a modal over the home page)
const fromVacanciesSlug: RedirectFunction = ({ params }) => {
  const landing = getLandingPage(params['slug']);
  if (landing) return inject(Router).createUrlTree(['/home'], { queryParams: landingSearchParams(landing) });
  const id = extractJobIdFromSlug(params['slug']);
  return inject(Router).createUrlTree(['/home'], id ? { queryParams: { [JOB_MODAL_PARAM]: id } } : {});
};

// The vacancies page is no longer used: its links (and the searches in them) open on home, whose
// search reads the same parameters (search, category, location, salary, mode, job). The page's
// component stays in the code base, unrouted.
const toHomeSearch: RedirectFunction = ({ queryParams }) => inject(Router).createUrlTree(['/home'], { queryParams });

// Old notifications URLs land on the profile (history accordion stays closed). Keeps incoming
// query params (e.g. ?token= from the Google login redirect).
const toProfileNotifications: RedirectFunction = ({ queryParams }) =>
  inject(Router).createUrlTree(['/profile'], { queryParams });

// The employers' side of the landing page used to be /home?for=employer; it's /employers now.
const toEmployersFromOldLink: CanActivateFn = (route) =>
  route.queryParamMap.get('for') === 'employer' ? inject(Router).createUrlTree(['/employers']) : true;

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home',
  },
  {
    path: 'home',
    // Links sent to employers before /employers existed (/home?for=employer) land there
    canActivate: [toEmployersFromOldLink],
    loadComponent: () => import('./Components/public/home/home').then((m) => m.Home),
    // One screen: the footer's links are in the hero's bottom corners instead
    data: { showHeroSection: true, hideFooter: true }
  },
  {
    path: 'employers',
    loadComponent: () => import('./Components/public/employers/employers').then((m) => m.Employers),
    // Like home: the footer's links are in the hero's bottom corners
    data: { hideFooter: true },
  },
  {
    path: 'vacancies',
    pathMatch: 'full',
    redirectTo: toHomeSearch,
  },
  {
    // Neither vacancies nor keyword searches have a page of their own: old links open the search
    path: 'vacancies/:slug',
    redirectTo: fromVacanciesSlug,
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
    path: 'favorites',
    loadComponent: () => import('./Components/public/favorites/favorites').then((m) => m.Favorites),
  },
  {
    // Company pages are gone (the server answers 410); in-app leftovers land on the search
    path: 'companies/:key',
    redirectTo: 'vacancies',
  },
  {
    path: 'contact',
    loadComponent: () => import('./Components/public/contact/contact').then((m) => m.Contact),
  },
  // Candidate's answer to an interview invitation (link from the email; no sign-in)
  {
    path: 'interview/:token',
    loadComponent: () => import('./Components/public/interview-answer/interview-answer').then((m) => m.InterviewAnswer),
    // standalone: no chat widget or bottom nav covering the answer buttons
    data: { hideFooter: true, standalone: true },
  },
  // Google's consent page returns here (in a popup) when an HR connects their calendar for Meet links
  {
    path: 'google-calendar/callback',
    loadComponent: () =>
      import('./Components/private/google-calendar-callback/google-calendar-callback').then((m) => m.GoogleCalendarCallback),
    canActivate: [authGuard],
    data: { hideLayout: true },
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
        data: { wideContent: true },
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
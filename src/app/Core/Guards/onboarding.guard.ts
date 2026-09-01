import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { StateStore } from '../../Store/state.store';
import { AuthService } from '../Services/auth-service';

/**
 * Ensures user has an active subscription before accessing private application features (dashboard, profile, jobs, etc.).
 * If subscription is null or missing, keeps/redirects the user to /private/onboarding.
 */
export const onboardingGuard: CanActivateFn = async (route, state): Promise<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const stateStore = inject(StateStore);
  const router = inject(Router);

  const urlToken = route.queryParamMap.get('token');
  if (urlToken) {
    authService.setToken(urlToken);
  }

  // If not logged in, authGuard will handle redirecting to /home
  if (!authService.isLoggedIn()) {
    return true;
  }

  // Load profile first to quickly determine subscription status
  if (!stateStore.profileLoaded() || stateStore.profile().id === 0) {
    await stateStore.loadProfile();
  }

  // If subscription is null or missing, keep user on onboarding wizard
  if (!stateStore.hasActiveSubscription()) {
    return router.createUrlTree(['/private/onboarding']);
  }

  return true;
};


/**
 * Protects /private/onboarding route: if user has already chosen a subscription,
 * redirects them to /private/dashboard (if PRO) or /private/profile unless they explicitly request edit mode (?edit=true).
 */
export const onboardingPageGuard: CanActivateFn = async (route, state): Promise<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const stateStore = inject(StateStore);
  const router = inject(Router);

  const urlToken = route.queryParamMap.get('token');
  if (urlToken) {
    authService.setToken(urlToken);
  }

  if (!authService.isLoggedIn()) {
    return true;
  }

  const allowEdit = route.queryParamMap.get('edit') === 'true';

  if (!stateStore.profileLoaded() || stateStore.profile().id === 0) {
    await stateStore.loadProfile();
  }

  // If user already has an active subscription and is not in edit mode, redirect to appropriate workspace
  if (stateStore.hasActiveSubscription() && !allowEdit) {
    if (stateStore.isPro()) {
      return router.createUrlTree(['/private/dashboard']);
    }
    return router.createUrlTree(['/private/profile']);
  }

  return true;
};


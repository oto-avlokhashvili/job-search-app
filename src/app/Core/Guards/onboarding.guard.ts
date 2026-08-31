import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { StateStore } from '../../Store/state.store';
import { AuthService } from '../Services/auth-service';

/**
 * Ensures user has completed onboarding before accessing private application features (dashboard, profile, jobs, etc.).
 * If onboarding is incomplete, redirects to /private/onboarding.
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

  // Load profile first to quickly determine onboarding and subscription status
  if (!stateStore.profileLoaded() || stateStore.profile().id === 0) {
    await stateStore.loadProfile();
  }

  // If onboarding is incomplete or subscription missing, redirect immediately to onboarding wizard
  if (!stateStore.hasActiveSubscription() || !stateStore.isOnboardingCompleted()) {
    return router.createUrlTree(['/private/onboarding']);
  }

  return true;
};


/**
 * Protects /private/onboarding route: if user has already completed onboarding,
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

  // If already loaded and completed onboarding without edit mode, redirect
  if (stateStore.profileLoaded() && stateStore.cvLoaded()) {
    if (stateStore.isOnboardingCompleted() && !allowEdit) {
      if (stateStore.isPro()) {
        return router.createUrlTree(['/private/dashboard']);
      }
      return router.createUrlTree(['/private/profile']);
    }
  }

  // Allow immediate navigation so user instantly sees onboarding board and its loading state
  return true;
};


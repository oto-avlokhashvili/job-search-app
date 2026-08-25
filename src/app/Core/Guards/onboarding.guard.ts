import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { StateStore } from '../../Store/state.store';
import { AuthService } from '../Services/auth-service';

/**
 * Ensures user has completed onboarding before accessing private application features (dashboard, profile, jobs, etc.).
 * If onboarding is incomplete, redirects to /private/onboarding.
 */
export const onboardingGuard: CanActivateFn = (route, state): boolean | UrlTree => {
  const authService = inject(AuthService);
  const stateStore = inject(StateStore);
  const router = inject(Router);

  // If not logged in, authGuard will handle redirecting to /home
  if (!authService.isLoggedIn()) {
    return true;
  }

  // If data is already hydrated and onboarding is incomplete, redirect immediately
  if (stateStore.profileLoaded() && stateStore.cvLoaded() && !stateStore.isOnboardingCompleted()) {
    return router.createUrlTree(['/private/onboarding']);
  }

  // Otherwise allow component to mount immediately so user sees instant progress bar / skeleton
  return true;
};

/**
 * Protects /private/onboarding route: if user has already completed onboarding,
 * redirects them to /private/dashboard unless they explicitly request edit mode (?edit=true).
 */
export const onboardingPageGuard: CanActivateFn = (route, state): boolean | UrlTree => {
  const authService = inject(AuthService);
  const stateStore = inject(StateStore);
  const router = inject(Router);

  if (!authService.isLoggedIn()) {
    return true;
  }

  const allowEdit = route.queryParamMap.get('edit') === 'true';

  // If already loaded in state and onboarding is 100% complete, redirect to dashboard
  if (stateStore.profileLoaded() && stateStore.cvLoaded() && stateStore.isOnboardingCompleted() && !allowEdit) {
    return router.createUrlTree(['/private/dashboard']);
  }

  // Otherwise allow component to mount immediately so it renders skeleton without delay
  return true;
};

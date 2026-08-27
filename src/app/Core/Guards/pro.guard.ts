import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StateStore } from '../../Store/state.store';

/**
 * Route guard that restricts access to PRO subscribers only.
 * Redirects non-PRO users to the jobs/notifications page.
 */
export const proGuard: CanActivateFn = async () => {
  const stateStore = inject(StateStore);
  const router = inject(Router);

  await stateStore.loadProfile();

  if (stateStore.isPro()) {
    return true;
  }

  // Non-PRO users are redirected to the jobs/notifications dashboard
  return router.createUrlTree(['/private/jobs']);
};

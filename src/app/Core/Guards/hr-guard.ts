import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { StateStore } from '../../Store/state.store';

// HR area: HR accounts (and admins) only. HR accounts wait on /hr/pending until an admin approves them.
// Routes with data.adminOnly are for admins only.
export const hrGuard: CanActivateChildFn = async (route, state) => {
  const stateStore = inject(StateStore);
  const router = inject(Router);

  await stateStore.loadProfile();
  const { role, hrApproved } = stateStore.profile();

  if (role === 'ADMIN') return true;
  if (role !== 'HR') return router.createUrlTree(['/vacancies']);
  if (route.data['adminOnly']) return router.createUrlTree(['/hr']);

  const onPendingPage = state.url.startsWith('/hr/pending');
  if (!hrApproved) return onPendingPage || router.createUrlTree(['/hr/pending']);
  return !onPendingPage || router.createUrlTree(['/hr']);
};

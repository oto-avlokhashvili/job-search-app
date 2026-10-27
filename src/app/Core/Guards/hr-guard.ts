import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { HrStore } from '../../Store/hr.store';
import { StateStore } from '../../Store/state.store';

// HR area: HR accounts (and admins) only. HR accounts wait on /hr/pending until an admin approves them.
// Routes with data.adminOnly are for admins only.
export const hrGuard: CanActivateChildFn = async (route, state) => {
  const stateStore = inject(StateStore);
  const router = inject(Router);
  const hrStore = inject(HrStore);

  await stateStore.loadProfile();
  const { role, hrApproved } = stateStore.profile();
  // Start the sidebar limits right away instead of after the layout loads; not awaited.
  if (role === 'ADMIN' || (role === 'HR' && hrApproved)) hrStore.loadUsage();

  if (role === 'ADMIN') return true;
  if (role !== 'HR') return router.createUrlTree(['/vacancies']);
  if (route.data['adminOnly']) return router.createUrlTree(['/hr']);

  const onPendingPage = state.url.startsWith('/hr/pending');
  if (!hrApproved) return onPendingPage || router.createUrlTree(['/hr/pending']);
  return !onPendingPage || router.createUrlTree(['/hr']);
};

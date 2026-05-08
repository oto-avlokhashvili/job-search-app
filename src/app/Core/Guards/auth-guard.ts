import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../Services/auth-service';

export const authGuard: CanActivateFn = (): boolean | UrlTree => {
  const service = inject(AuthService);
  const router = inject(Router);
  const publicRoutes = ['/auth/google', '/auth/google/callback'];

  if (publicRoutes.some(r => router.url.startsWith(r))) {
    return true;
  }
  if (service.isLoggedIn()) {
    return true;
  } else {
    router.navigate(['/auth'], {
      queryParams: { returnUrl: router.url },
    });
    return false;
  }
};

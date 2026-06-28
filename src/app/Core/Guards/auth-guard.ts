import { inject } from '@angular/core';
import { CanActivateFn, UrlTree, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService } from '../Services/auth-service';

export const authGuard: CanActivateFn = (route: ActivatedRouteSnapshot): boolean | UrlTree => {
  const service = inject(AuthService);
  const router = inject(Router);

  // If there's a token in the URL, let it through — layout will extract it
  const urlToken = route.queryParamMap.get('token');
  if (urlToken) {
    return true;
  }

  if (service.isLoggedIn()) {
    return true;
  } else {
    service.openAuthModal('login', router.url);
    router.navigate(['/home']);
    return false;
  }
};
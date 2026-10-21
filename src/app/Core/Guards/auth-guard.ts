import { inject } from '@angular/core';
import { CanActivateFn, UrlTree, ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../Services/auth-service';

export const authGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree => {
  const service = inject(AuthService);
  const router = inject(Router);

  // If there's a token in the URL (Google login redirect), store it and drop it from the address bar.
  const urlToken = route.queryParamMap.get('token');
  if (urlToken) {
    service.setToken(urlToken);
    const clean = router.parseUrl(state.url);
    delete clean.queryParams['token'];
    return clean;
  }

  if (service.isLoggedIn()) {
    return true;
  } else {
    service.openAuthModal('login', state.url);
    router.navigate(['/home']);
    return false;
  }
};

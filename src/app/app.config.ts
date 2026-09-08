import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { PreloadAllModules, provideRouter, withPreloading, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { loadingInterceptor } from './Core/Interceptors/loading.interceptor';
import { authInterceptor } from './Core/Interceptors/auth-interceptor';
import { apiTransferCacheInterceptor } from './Core/Interceptors/api-transfer-cache.interceptor';
import { provideClientHydration, withEventReplay, withNoHttpTransferCache } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })
    ),
    provideHttpClient(
      withFetch(), withInterceptors([loadingInterceptor, authInterceptor, apiTransferCacheInterceptor])
    ),
    // Angular's built-in HTTP transfer cache can't work here: it keys on the final
    // outgoing request, which on the server has already been rewritten to an absolute
    // backend URL (see ssrApiBaseUrlInterceptor). apiTransferCacheInterceptor replaces
    // it for /api/* calls, keyed on the original relative URL instead.
    provideClientHydration(withEventReplay(), withNoHttpTransferCache())
  ]
};

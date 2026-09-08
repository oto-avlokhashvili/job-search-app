import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { ssrApiBaseUrlInterceptor } from './Core/Interceptors/ssr-api-base-url.interceptor';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Server-only: resolves relative /api/* calls to the real backend origin
    // (see the interceptor for why). Adds to, not replaces, appConfig's interceptors.
    provideHttpClient(withInterceptors([ssrApiBaseUrlInterceptor]))
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);

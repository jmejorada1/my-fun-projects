import { ApplicationConfig, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { domainHeaderInterceptor } from './core/domain-header.interceptor';
import { errorInterceptor } from './core/error.interceptor';
import { loadApiConfig } from './core/api-config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([domainHeaderInterceptor, errorInterceptor])),
    // Resolves ApiConfigService.baseUrl() from /config.json before the app
    // finishes bootstrapping — see core/api-config.ts.
    provideAppInitializer(loadApiConfig),
  ],
};

import {
  type ApplicationConfig,
  importProvidersFrom,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ModalModule } from 'ngx-bootstrap/modal';
import { provideToastr } from 'ngx-toastr';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { loaderInterceptor } from './core/loader/loader.interceptor';
import { AuthService } from './core/auth/auth.service';
import { BrandingService } from './core/branding/branding.service';
import { CssMapService } from './dynamic-form/css-map.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),
    provideHttpClient(withInterceptors([loaderInterceptor, authInterceptor])),
    importProvidersFrom(ModalModule.forRoot()),
    provideAnimations(), // ngx-bootstrap (datepicker, etc.) + toastr need animations
    provideToastr({ positionClass: 'toast-top-right', timeOut: 4000, progressBar: true, newestOnTop: true }),
    // Load the css.json class map (dynamic-form theming) before first render.
    provideAppInitializer(() => inject(CssMapService).load()),
    // Load white-label branding (logo + product name) from the public /api/meta.
    provideAppInitializer(() => inject(BrandingService).load()),
    // Silent session restore before routes activate: try /api/auth/refresh (the
    // httpOnly cookie persists reloads); on success, hydrate the token + profile.
    provideAppInitializer(() => inject(AuthService).restoreSession()),
  ],
};

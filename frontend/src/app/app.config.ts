import {
  type ApplicationConfig,
  importProvidersFrom,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ModalModule } from 'ngx-bootstrap/modal';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { CssMapService } from './dynamic-form/css-map.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    importProvidersFrom(ModalModule.forRoot()),
    provideAnimations(), // ngx-bootstrap (datepicker, etc.) needs animations
    // Load the css.json class map (dynamic-form theming) before first render.
    provideAppInitializer(() => inject(CssMapService).load()),
    // Silent session restore before routes activate: try /api/auth/refresh (the
    // httpOnly cookie persists reloads); on success, hydrate the token + profile.
    provideAppInitializer(() => inject(AuthService).restoreSession()),
  ],
};

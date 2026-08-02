import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { catchError, firstValueFrom, of } from 'rxjs';
import { SKIP_LOADER } from '../loader/loader.interceptor';
import type { MetaResponse } from '../models/api.models';

/**
 * Deployment-level integration UI settings, loaded once from the PUBLIC /api/meta
 * at startup. Currently just whether the Admin "Integrations" logs page is shown
 * (`integrations.logsUi` in the backend config) — used to hide the nav entry and
 * guard the route. Dedicated service, kept separate from branding/collatio.
 */
@Injectable({ providedIn: 'root' })
export class IntegrationSettingsService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<{ logsUi: boolean }>({ logsUi: true });

  readonly logsUiEnabled = computed(() => this.state().logsUi);

  async load(): Promise<void> {
    const meta = await firstValueFrom(
      this.http
        .get<MetaResponse>('/api/meta', { context: new HttpContext().set(SKIP_LOADER, true) })
        .pipe(catchError(() => of(null))),
    );
    // Default to shown when meta is unreachable or the field is absent.
    this.state.set({ logsUi: meta?.integrations?.logsUi !== false });
  }
}

import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { catchError, firstValueFrom, of } from 'rxjs';
import { SKIP_LOADER } from '../loader/loader.interceptor';
import type { CollatioConfig, MetaResponse } from '../models/api.models';

/**
 * Collatio (AI document & email parser) integration. Per-deployment config
 * (base URL + the tenant's appName/departmentId) is loaded once from the PUBLIC
 * /api/meta at startup — the same source branding uses — and kept here so any
 * view can deep-link a record to its Collatio reconciliation. Values come from
 * the backend runtime config (never baked into the image); when `baseUrl` is
 * blank the integration is simply disabled.
 */
@Injectable({ providedIn: 'root' })
export class CollatioService {
  private readonly http = inject(HttpClient);
  private readonly config = signal<CollatioConfig | null>(null);

  /** True when a base URL is configured, i.e. deep links can be built. */
  readonly enabled = computed(() => !!this.config()?.baseUrl);

  async load(): Promise<void> {
    const meta = await firstValueFrom(
      this.http
        .get<MetaResponse>('/api/meta', { context: new HttpContext().set(SKIP_LOADER, true) })
        .pipe(catchError(() => of(null))),
    );
    this.config.set(meta?.collatio ?? null);
  }

  /**
   * Deep link to a document's reconciliation view, or null when Collatio isn't
   * configured or the record carries no document id.
   */
  reconciliationUrl(docId: unknown): string | null {
    const c = this.config();
    if (!c?.baseUrl || typeof docId !== 'string' || !docId.trim()) return null;
    const base = c.baseUrl.replace(/\/+$/, '');
    const params = new URLSearchParams({ appName: c.appName, departmentId: c.departmentId });
    return `${base}/#/documents/summary/${encodeURIComponent(docId.trim())}?${params.toString()}`;
  }
}

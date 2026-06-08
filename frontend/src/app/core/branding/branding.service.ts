import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { catchError, firstValueFrom, of } from 'rxjs';
import { SKIP_LOADER } from '../loader/loader.interceptor';
import type { Branding, MetaResponse } from '../models/api.models';

/**
 * White-label branding (product name + logo) for the SPA. Loaded once from the
 * PUBLIC /api/meta at startup (so the login screen is branded too), with sensible
 * defaults if the API is unreachable. Per-deployment values come from the backend
 * config's `branding` section; the logo is a frontend asset that a client build
 * can replace.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<Branding>({ productName: 'IQ-SMART ERP', logoUrl: '/branding/logo.svg' });

  readonly productName = computed(() => this.state().productName);
  readonly logoUrl = computed(() => this.state().logoUrl);

  async load(): Promise<void> {
    const meta = await firstValueFrom(
      this.http
        .get<MetaResponse>('/api/meta', { context: new HttpContext().set(SKIP_LOADER, true) })
        .pipe(catchError(() => of(null))),
    );
    if (!meta) return;
    this.state.set({
      productName: meta.branding?.productName || meta.name || 'IQ-SMART ERP',
      logoUrl: meta.branding?.logoUrl || '/branding/logo.svg',
    });
  }
}

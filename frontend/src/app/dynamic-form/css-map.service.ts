import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, of } from 'rxjs';

/**
 * Resolves "slug → CSS class string" for the dynamic form, so the same components
 * can be molded differently per deployment (#4). Built-in defaults are merged with
 * an optional /css.json (client-overridable) loaded at startup. cls() is synchronous
 * and always returns at least the defaults.
 */
const DEFAULT_CSS_MAP: Record<string, string> = {
  form: 'erp-form',
  'form.two-column': 'erp-form erp-form--two-column',
  field: 'erp-field',
  'field.col2': 'erp-field',
  label: 'erp-field__label form-label',
  error: 'erp-field__error',
  actions: 'erp-form__actions',
};

@Injectable({ providedIn: 'root' })
export class CssMapService {
  private readonly http = inject(HttpClient);
  private readonly map = signal<Record<string, string>>(DEFAULT_CSS_MAP);

  /** Load /css.json and merge over the defaults (called from an app initializer). */
  async load(): Promise<void> {
    const loaded = await firstValueFrom(
      this.http.get<Record<string, string>>('/css.json').pipe(catchError(() => of({}))),
    );
    this.map.set({ ...DEFAULT_CSS_MAP, ...loaded });
  }

  /** Resolve one or more slugs to a combined class string. */
  cls(...slugs: string[]): string {
    const m = this.map();
    return slugs
      .map((s) => m[s] ?? '')
      .filter(Boolean)
      .join(' ');
  }
}

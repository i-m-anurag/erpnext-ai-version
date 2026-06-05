import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, of } from 'rxjs';

/**
 * Slug-based CSS map for the dynamic form (#css.json). Structure:
 *
 *   {
 *     "<slug>": {                       // slug = the form's slug, or "default"
 *       "form":    { "parent": "...", "twoColumn": "..." },
 *       "field":   { "parent": "...", "label": "...", "control": "...", "error": "..." },
 *       "actions": { "parent": "..." },
 *       "fields":  { "<fieldKey>": { "parent": "...", "control": "..." } }  // per-field overrides
 *     }
 *   }
 *
 * Resolution precedence for a node (e.g. field.control for field "gstin" on form "x"):
 *   x.fields.gstin.<node>  →  x.field.<node>  →  default.fields.gstin.<node>  →  default.field.<node>
 * So you only override what differs; everything else inherits the "default" profile.
 *
 * `control` is intentionally NOT set in the built-in default — each field component
 * owns its natural control class (e.g. form-control vs form-check-input); css.json
 * only overrides it when present (per slug or per field).
 */
type NodeMap = Record<string, string>;
interface SlugCss {
  form?: NodeMap;
  field?: NodeMap;
  actions?: NodeMap;
  fields?: Record<string, NodeMap>;
}
type CssConfig = Record<string, SlugCss>;

type Part = 'form' | 'field' | 'actions';

const DEFAULT_CSS: CssConfig = {
  default: {
    form: { parent: 'erp-form', twoColumn: 'erp-form erp-form--two-column' },
    field: { parent: 'erp-field', label: 'erp-field__label form-label', error: 'erp-field__error' },
    actions: { parent: 'erp-form__actions' },
  },
};

@Injectable({ providedIn: 'root' })
export class CssMapService {
  private readonly http = inject(HttpClient);
  private readonly config = signal<CssConfig>(DEFAULT_CSS);

  /** Load /css.json and deep-merge it over the built-in defaults (app initializer). */
  async load(): Promise<void> {
    const loaded = await firstValueFrom(
      this.http.get<CssConfig>('/css.json').pipe(catchError(() => of({} as CssConfig))),
    );
    this.config.set(this.merge(DEFAULT_CSS, loaded));
  }

  // ── Public resolvers (used by the dynamic form + field components) ───────────
  formClass(slug: string, twoColumn: boolean): string {
    return twoColumn
      ? this.get(slug, 'form', 'twoColumn') || this.get(slug, 'form', 'parent')
      : this.get(slug, 'form', 'parent');
  }
  fieldClass(slug: string, fieldKey: string): string {
    return this.get(slug, 'field', 'parent', fieldKey);
  }
  labelClass(slug: string, fieldKey: string): string {
    return this.get(slug, 'field', 'label', fieldKey);
  }
  controlClass(slug: string, fieldKey: string): string {
    return this.get(slug, 'field', 'control', fieldKey);
  }
  errorClass(slug: string, fieldKey: string): string {
    return this.get(slug, 'field', 'error', fieldKey);
  }
  actionsClass(slug: string): string {
    return this.get(slug, 'actions', 'parent');
  }

  // ── Internals ───────────────────────────────────────────────────────────────
  /** Resolve one node with the slug → default fallback chain. */
  private get(slug: string, part: Part, node: string, fieldKey?: string): string {
    const c = this.config();
    return this.pick(c[slug], part, node, fieldKey) ?? this.pick(c['default'], part, node, fieldKey) ?? '';
  }

  private pick(slugCss: SlugCss | undefined, part: Part, node: string, fieldKey?: string): string | undefined {
    if (!slugCss) return undefined;
    if (fieldKey) {
      const perField = slugCss.fields?.[fieldKey]?.[node];
      if (perField) return perField;
    }
    return slugCss[part]?.[node];
  }

  private merge(base: CssConfig, over: CssConfig): CssConfig {
    const out = structuredClone(base) as Record<string, unknown>;
    for (const [slug, value] of Object.entries(over)) {
      out[slug] = this.deepMerge((out[slug] as Record<string, unknown>) ?? {}, value as Record<string, unknown>);
    }
    return out as CssConfig;
  }

  private deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...a };
    for (const [k, v] of Object.entries(b)) {
      out[k] =
        v && typeof v === 'object' && !Array.isArray(v)
          ? this.deepMerge((out[k] as Record<string, unknown>) ?? {}, v as Record<string, unknown>)
          : v;
    }
    return out;
  }
}

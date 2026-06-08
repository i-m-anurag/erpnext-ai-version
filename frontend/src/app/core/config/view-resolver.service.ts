import { inject, Injectable } from '@angular/core';
import { forkJoin, map, type Observable, of, switchMap } from 'rxjs';
import { MasterApiService } from '../api/master.api.service';
import { FormApiService } from '../api/form.api.service';
import type { FormDefinition, FormFieldDef, MasterRegistry, MasterRow } from '../models/api.models';
import { BACKED_VIEWS, getView, type ListColumn, type ResolvedView } from './view-configs';

/**
 * Resolves a ViewConfig for a module/sub-module. Backend-backed views (see
 * BACKED_VIEWS) pull their form + columns + rows from the generic master system
 * so CRUD round-trips to the API; everything else falls back to a static mock
 * config. Both yield a uniform ResolvedView the List/Record components render.
 */
@Injectable({ providedIn: 'root' })
export class ViewResolverService {
  private readonly masters = inject(MasterApiService);
  private readonly forms = inject(FormApiService);

  resolve(module: string, sub: string): Observable<ResolvedView | undefined> {
    const backed = BACKED_VIEWS[`${module}/${sub}`];
    if (backed) {
      return this.masters.getMaster(backed.masterSlug).pipe(
        switchMap((reg) =>
          forkJoin({
            form: this.forms.getForm(reg.formSlug ?? ''),
            rows: this.masters.listData(reg.slug),
          }).pipe(map(({ form, rows }) => this.fromBackend(module, sub, reg, form, rows))),
        ),
      );
    }
    const mock = getView(module, sub);
    return of(mock ? { ...mock, backed: false } : undefined);
  }

  /** Build a ResolvedView from backend master metadata + form + data rows. */
  private fromBackend(
    module: string,
    sub: string,
    reg: MasterRegistry,
    form: FormDefinition,
    rows: MasterRow[],
  ): ResolvedView {
    // Curated presentation (title/singular/panels) from the mock config if present.
    const meta = getView(module, sub);
    const idKey = reg.codeField;
    return {
      module,
      sub,
      title: meta?.title ?? reg.name,
      singular: meta?.singular ?? reg.name,
      idKey,
      form,
      columns: form.fields.map((f) => this.toColumn(f, idKey)),
      rows: rows.map((r) => ({ ...r.data })),
      panels: meta?.panels ?? { timeline: true, comments: true },
      workflow: meta?.workflow,
      backed: true,
      masterSlug: reg.slug,
      ids: Object.fromEntries(rows.map((r) => [r.code, r.id])),
    };
  }

  private toColumn(field: FormFieldDef, idKey: string): ListColumn {
    let kind: ListColumn['kind'] = 'text';
    if (field.key === idKey || field.type === 'number') kind = 'mono';
    else if (field.type === 'select') kind = 'chip';
    else if (field.type === 'date') kind = 'date';
    return { key: field.key, label: field.label, kind };
  }
}

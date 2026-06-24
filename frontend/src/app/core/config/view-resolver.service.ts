import { inject, Injectable } from '@angular/core';
import { forkJoin, map, type Observable, of, switchMap } from 'rxjs';
import { MasterApiService } from '../api/master.api.service';
import { FormApiService } from '../api/form.api.service';
import { flattenDataFields, type FormDefinition, type FormFieldDef, type MasterRegistry, type MasterRow } from '../models/api.models';
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
      columns: this.listColumns(form, idKey),
      rows: rows.map((r) => ({ ...r.data })),
      panels: meta?.panels ?? { timeline: true, comments: true },
      workflow: meta?.workflow,
      backed: true,
      masterSlug: reg.slug,
      ids: Object.fromEntries(rows.map((r) => [r.code, r.id])),
    };
  }

  /**
   * Decide which form fields become list-view columns.
   * Line-item (`table`) fields are never columns. Among scalar fields:
   *  • opt-in mode — if any field declares `inList: true`, show only those.
   *  • opt-out mode — otherwise show every scalar field except `inList: false`.
   * The code field is always kept so rows stay identifiable.
   */
  private listColumns(form: FormDefinition, idKey: string): ListColumn[] {
    // Flatten display groups (their children are real fields); drop table and
    // nested (jsonb) group fields — neither makes a sensible list column.
    const scalar = flattenDataFields(form.fields).filter((f) => f.type !== 'table' && f.type !== 'group');
    const hasOptIn = scalar.some((f) => f.inList === true);
    const chosen = scalar.filter((f) =>
      f.key === idKey ? true : hasOptIn ? f.inList === true : f.inList !== false,
    );
    return chosen.map((f) => this.toColumn(f, idKey));
  }

  private toColumn(field: FormFieldDef, idKey: string): ListColumn {
    let kind: ListColumn['kind'] = 'text';
    if (field.key === idKey || field.type === 'number') kind = 'mono';
    else if (field.type === 'select') kind = 'chip';
    else if (field.type === 'date') kind = 'date';
    return { key: field.key, label: field.label, kind };
  }
}

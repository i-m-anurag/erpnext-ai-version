import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import {
  type ColDef,
  type RowSelectionOptions,
  type SelectionChangedEvent,
  themeQuartz,
} from 'ag-grid-community';
import { BsModalService } from 'ngx-bootstrap/modal';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MasterApiService } from '../../core/api/master.api.service';
import { FormApiService } from '../../core/api/form.api.service';
import { NotificationService } from '../../core/notify/notification.service';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import { MasterFormModalComponent } from './master-form-modal.component';
import type { FormDefinition, MasterRegistry, MasterRow } from '../../core/models/api.models';

interface GridRow {
  __row: MasterRow;
  [key: string]: unknown;
}

@Component({
  selector: 'erp-master-detail',
  imports: [AgGridAngular, RouterLink, HasPermissionDirective],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <a routerLink="/app/masters" class="text-decoration-none small text-muted">← Masters</a>
        <h4 class="mb-0">{{ master()?.name ?? slug() }}</h4>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-secondary" (click)="reload()">Refresh</button>
        @if (editable()) {
          <button *hasPermission="'master:create'" class="btn btn-sm btn-primary" (click)="openCreate()">+ Add</button>
          <button *hasPermission="'master:update'" class="btn btn-sm btn-outline-primary" [disabled]="!selected()" (click)="openEdit()">Edit</button>
          <button *hasPermission="'master:delete'" class="btn btn-sm btn-outline-danger" [disabled]="!selected()" (click)="remove()">Delete</button>
        }
      </div>
    </div>

    @if (!editable()) {
      <div class="alert alert-secondary py-2 small">This is a seeded master — read-only.</div>
    }

    <ag-grid-angular
      [theme]="theme"
      [rowData]="rowData()"
      [columnDefs]="colDefs()"
      [rowSelection]="rowSelection"
      (selectionChanged)="onSelectionChanged($event)"
      style="height: 70vh; width: 100%"
    />
  `,
})
export class MasterDetailComponent {
  /** Bound from the route param via withComponentInputBinding(). */
  readonly slug = input.required<string>();

  protected readonly theme = themeQuartz;
  protected readonly rowSelection: RowSelectionOptions = { mode: 'singleRow', checkboxes: false, enableClickSelection: true };

  protected readonly master = signal<MasterRegistry | null>(null);
  protected readonly form = signal<FormDefinition | null>(null);
  protected readonly rows = signal<MasterRow[]>([]);
  protected readonly selected = signal<MasterRow | null>(null);

  protected readonly colDefs = signal<ColDef[]>([]);
  protected readonly rowData = signal<GridRow[]>([]);

  private readonly api = inject(MasterApiService);
  private readonly formApi = inject(FormApiService);
  private readonly modal = inject(BsModalService);
  private readonly notify = inject(NotificationService);

  protected editable(): boolean {
    return this.master()?.editable === true;
  }

  constructor() {
    // Reload whenever the route slug changes.
    effect(() => {
      const slug = this.slug();
      this.selected.set(null);
      this.api.getMaster(slug).subscribe((m) => {
        this.master.set(m);
        const form$ = m.formSlug
          ? this.formApi.getForm(m.formSlug).pipe(catchError(() => of(null)))
          : of(null);
        forkJoin({ form: form$, rows: this.api.listData(slug) }).subscribe(({ form, rows }) => {
          this.form.set(form);
          this.colDefs.set(this.buildColumns(form, rows));
          this.rows.set(rows);
          this.rowData.set(rows.map((r) => ({ __row: r, ...r.data })));
        });
      });
    });
  }

  protected reload(): void {
    this.api.listData(this.slug()).subscribe((rows) => {
      this.rows.set(rows);
      this.rowData.set(rows.map((r) => ({ __row: r, ...r.data })));
      this.selected.set(null);
    });
  }

  protected onSelectionChanged(e: SelectionChangedEvent): void {
    const nodes = e.api.getSelectedNodes();
    this.selected.set((nodes[0]?.data as GridRow | undefined)?.__row ?? null);
  }

  protected openCreate(): void {
    this.openModal();
  }

  protected openEdit(): void {
    const row = this.selected();
    if (row) this.openModal(row);
  }

  protected remove(): void {
    const row = this.selected();
    const m = this.master();
    if (!row || !m) return;
    if (!confirm(`Delete "${row.code}"?`)) return;
    this.api.deleteData(m.slug, row.id).subscribe({
      next: () => {
        this.notify.success(`Deleted "${row.code}"`);
        this.reload();
      },
      error: () => this.notify.error('Delete failed'),
    });
  }

  private openModal(row?: MasterRow): void {
    const m = this.master();
    if (!m?.formSlug) return;
    const ref = this.modal.show(MasterFormModalComponent, {
      class: 'modal-lg',
      initialState: {
        masterSlug: m.slug,
        formSlug: m.formSlug,
        title: m.name,
        rowId: row?.id,
        initialData: row?.data,
      },
    });
    ref.content?.saved.subscribe(() => this.reload());
  }

  private buildColumns(form: FormDefinition | null, rows: MasterRow[]): ColDef[] {
    if (form) {
      return form.fields.map((f) => ({ headerName: f.label, field: f.key, flex: 1, sortable: true, filter: true }));
    }
    // No form (seeded master): derive columns from the row data keys.
    const keys = new Set<string>();
    for (const r of rows) Object.keys(r.data).forEach((k) => keys.add(k));
    return [...keys].map((k) => ({ headerName: k, field: k, flex: 1, sortable: true, filter: true }));
  }
}

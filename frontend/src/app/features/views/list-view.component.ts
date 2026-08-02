import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { type ColDef, type RowClickedEvent, themeQuartz } from 'ag-grid-community';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ViewResolverService } from '../../core/config/view-resolver.service';
import type { ListColumn, ResolvedView } from '../../core/config/view-configs';
import { badgeHtml, formatDateTime, lifecycleTone, stateTone } from '../../core/util/format';
import { IntegrationApiService } from '../../core/api/integration.api.service';
import { CollatioUploadModalComponent } from '../integration/collatio-upload-modal.component';

/** Maps a value to a status-chip class (mock heuristic). */
function chipClass(value: unknown): string {
  const v = String(value).toLowerCase();
  if (['active', 'approved', 'completed', 'posted', 'finished'].includes(v)) return 'iq-chip--ok';
  if (['pending', 'draft', 'inactive', 'on hold'].includes(v)) return 'iq-chip--warn';
  return 'iq-chip--info';
}

/** Row keys holding the master-row lifecycle status and business state (set by the
 *  resolver, prefixed so they can't collide with a form field named status/state). */
const ROW_STATUS = '__rowStatus';
const ROW_STATE = '__rowState';

/**
 * Generic List/Table view. Resolves a ViewConfig for the given module/sub from
 * the backend (or a mock fallback) and renders columns/rows from it. Row click
 * opens the Record view.
 */
@Component({
  selector: 'erp-list-view',
  imports: [AgGridAngular],
  template: `
    @if (config(); as cfg) {
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div>
          <div class="text-muted small">{{ cfg.title }}@if (!cfg.backed) { · demo data }</div>
          <h4 class="mb-0">{{ cfg.title }}</h4>
        </div>
        <div class="d-flex gap-2 align-items-center">
          <div class="iq-search"><i class="ph ph-magnifying-glass"></i><input placeholder="Search {{ cfg.title.toLowerCase() }}" /></div>
          <button class="btn btn-sm btn-ai"><i class="ph ph-sparkle"></i> Ask IQ</button>
          @if (collatioUpload()) {
            <button class="btn btn-sm btn-ai" (click)="openCollatio()">
              <i class="ph-fill ph-file-arrow-up"></i> Create using Collatio
            </button>
          }
          <button class="btn btn-sm btn-primary" (click)="create()"><i class="ph ph-plus"></i> New</button>
        </div>
      </div>

      <ag-grid-angular
        [theme]="theme"
        [rowData]="cfg.rows"
        [columnDefs]="colDefs()"
        [rowSelection]="rowSelection"
        (rowClicked)="open($event)"
        style="height: calc(100vh - 200px); width: 100%; cursor: pointer"
      />
    } @else if (loading()) {
      <div class="erp-card p-4 text-muted"><i class="ph ph-circle-notch"></i> Loading…</div>
    } @else {
      <div class="erp-card p-4 text-muted">No view configured.</div>
    }
  `,
})
export class ListViewComponent {
  readonly module = input.required<string>();
  readonly sub = input.required<string>();

  protected readonly theme = themeQuartz;
  protected readonly rowSelection = { mode: 'singleRow', checkboxes: false, enableClickSelection: true } as const;
  protected readonly config = signal<ResolvedView | undefined>(undefined);
  protected readonly loading = signal(false);

  private readonly resolver = inject(ViewResolverService);
  private readonly router = inject(Router);
  private readonly integrations = inject(IntegrationApiService);
  private readonly modals = inject(BsModalService);

  /** Whether this list's master has Collatio document-upload enabled. */
  protected readonly collatioUpload = signal(false);

  constructor() {
    effect(() => {
      const module = this.module();
      const sub = this.sub();
      this.config.set(undefined);
      this.collatioUpload.set(false);
      this.loading.set(true);
      this.resolver.resolve(module, sub).subscribe({
        next: (cfg) => {
          this.config.set(cfg);
          this.loading.set(false);
          if (cfg?.backed && cfg.masterSlug) {
            this.integrations.configFor(cfg.masterSlug).subscribe({
              next: (ic) => this.collatioUpload.set(!!ic.collatioUpload?.enabled),
              error: () => this.collatioUpload.set(false),
            });
          }
        },
        error: () => this.loading.set(false),
      });
    });
  }

  /** Open the Collatio upload popup; on success open the created draft record. */
  protected openCollatio(): void {
    const cfg = this.config();
    if (!cfg?.masterSlug) return;
    const ref = this.modals.show(CollatioUploadModalComponent, {
      class: 'modal-dialog-centered',
      initialState: { slug: cfg.masterSlug, label: cfg.singular ?? cfg.title },
    });
    const modal = ref.content as CollatioUploadModalComponent | undefined;
    modal?.uploaded.subscribe((res) => {
      void this.router.navigate(['/app/m', cfg.module, cfg.sub, res.code]);
    });
  }

  protected readonly colDefs = computed<ColDef[]>(() => {
    const cfg = this.config();
    const cols: ColDef[] = (cfg?.columns ?? []).map((c: ListColumn) => {
      const def: ColDef = { headerName: c.label, field: c.key, flex: 1, sortable: true, filter: true, resizable: true };
      if (c.kind === 'mono') def.cellClass = 'iq-mono';
      if (c.kind === 'date') { def.valueFormatter = (p) => formatDateTime(p.value); def.minWidth = 175; }
      if (c.kind === 'chip') {
        def.cellRenderer = (p: { value: unknown }) =>
          `<span class="iq-chip ${chipClass(p.value)}">${p.value ?? ''}</span>`;
      }
      return def;
    });

    // Status + state badges, appended for backend-backed views (mocks have neither).
    // State only when at least one row carries one — masters have no business state.
    if (cfg?.backed) {
      cols.push({
        headerName: 'Status', field: ROW_STATUS, minWidth: 120, sortable: true, filter: true, resizable: true,
        cellRenderer: (p: { value: unknown }) => badgeHtml(p.value, lifecycleTone(p.value)),
      });
      if ((cfg.rows ?? []).some((r) => (r as Record<string, unknown>)[ROW_STATE])) {
        cols.push({
          headerName: 'State', field: ROW_STATE, minWidth: 130, sortable: true, filter: true, resizable: true,
          cellRenderer: (p: { value: unknown }) => badgeHtml(p.value, stateTone(p.value)),
        });
      }
    }
    return cols;
  });

  protected open(e: RowClickedEvent): void {
    const cfg = this.config();
    if (!cfg) return;
    const id = (e.data as Record<string, unknown>)[cfg.idKey];
    void this.router.navigate(['/app/m', cfg.module, cfg.sub, String(id)]);
  }

  protected create(): void {
    const cfg = this.config();
    if (!cfg) return;
    void this.router.navigate(['/app/m', cfg.module, cfg.sub, 'new']);
  }
}

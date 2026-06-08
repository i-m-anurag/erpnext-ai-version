import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { type ColDef, type RowClickedEvent, themeQuartz } from 'ag-grid-community';
import { ViewResolverService } from '../../core/config/view-resolver.service';
import type { ListColumn, ResolvedView } from '../../core/config/view-configs';

/** Maps a value to a status-chip class (mock heuristic). */
function chipClass(value: unknown): string {
  const v = String(value).toLowerCase();
  if (['active', 'approved', 'completed', 'posted', 'finished'].includes(v)) return 'iq-chip--ok';
  if (['pending', 'draft', 'inactive', 'on hold'].includes(v)) return 'iq-chip--warn';
  return 'iq-chip--info';
}

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

  constructor() {
    effect(() => {
      const module = this.module();
      const sub = this.sub();
      this.config.set(undefined);
      this.loading.set(true);
      this.resolver.resolve(module, sub).subscribe({
        next: (cfg) => {
          this.config.set(cfg);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    });
  }

  protected readonly colDefs = computed<ColDef[]>(() =>
    (this.config()?.columns ?? []).map((c: ListColumn) => {
      const def: ColDef = { headerName: c.label, field: c.key, flex: 1, sortable: true, filter: true, resizable: true };
      if (c.kind === 'mono') def.cellClass = 'iq-mono';
      if (c.kind === 'chip') {
        def.cellRenderer = (p: { value: unknown }) =>
          `<span class="iq-chip ${chipClass(p.value)}">${p.value ?? ''}</span>`;
      }
      return def;
    }),
  );

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

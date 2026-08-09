import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { type ColDef, type ICellRendererParams, type ValueGetterParams, themeQuartz } from 'ag-grid-community';
import { AssignmentApiService, type Assignment } from '../../core/api/assignment.api.service';
import { routeForMaster } from '../../core/config/view-configs';
import { formatDateTime } from '../../core/util/format';

/**
 * "My Work" — the current user's open workflow assignments across every module.
 * A row click opens the underlying record (routed via its master's view config).
 */
@Component({
  selector: 'erp-my-work',
  imports: [AgGridAngular],
  template: `
    <div class="mb-3"><div class="text-muted small">Workflow</div><h4 class="mb-0">My Work</h4></div>
    <p class="text-muted small mb-3" style="max-width:620px">
      Records currently assigned to you. Click a row to open the record and take action.
    </p>
    @if (rows().length === 0) {
      <div class="erp-card p-4 text-muted small"><i class="ph ph-check-circle"></i> Nothing assigned to you right now.</div>
    } @else {
      <ag-grid-angular
        [theme]="theme" [rowData]="rows()" [columnDefs]="colDefs" [defaultColDef]="defaultColDef"
        [context]="ctx" (rowClicked)="open($event.data)"
        style="height: calc(100vh - 260px); width: 100%; cursor: pointer" />
    }
  `,
})
export class MyWorkComponent {
  private readonly api = inject(AssignmentApiService);
  private readonly router = inject(Router);

  protected readonly theme = themeQuartz;
  protected readonly rows = signal<Assignment[]>([]);
  protected readonly ctx = {};

  protected readonly defaultColDef: ColDef = { sortable: true, filter: false, resizable: true, flex: 1 };
  protected readonly colDefs: ColDef<Assignment>[] = [
    { headerName: 'Record', field: 'recordId', minWidth: 150 },
    { headerName: 'Type', field: 'entityType', minWidth: 140, valueFormatter: (p) => this.pretty(String(p.value ?? '')) },
    { headerName: 'State', field: 'state', minWidth: 150 },
    { headerName: 'Assigned as', field: 'role', minWidth: 120, valueFormatter: (p) => this.pretty(String(p.value ?? '')) },
    { headerName: 'Assigned', field: 'createdAt', minWidth: 170, valueFormatter: (p) => formatDateTime(p.value) },
    {
      headerName: 'Age', minWidth: 90, sortable: true,
      valueGetter: (p: ValueGetterParams<Assignment>) => this.ageDays(p.data?.createdAt),
      cellRenderer: (p: ICellRendererParams<Assignment>) => (p.value === 0 ? 'today' : `${p.value}d`),
    },
  ];

  constructor() {
    this.api.mine('open').subscribe((a) => this.rows.set(a));
  }

  protected open(a: Assignment | undefined): void {
    if (!a) return;
    const route = routeForMaster(a.entityType);
    if (!route) return;
    void this.router.navigate(['/app/m', route[0], route[1], a.recordId]);
  }

  private pretty(s: string): string {
    return s ? s.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';
  }
  private ageDays(iso: string | undefined): number {
    if (!iso) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  }
}

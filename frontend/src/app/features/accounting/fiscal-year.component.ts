import { Component, inject, signal } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { type ColDef, type ICellRendererParams, themeQuartz } from 'ag-grid-community';
import { FiscalYearApiService, type FiscalYear } from '../../core/api/fiscal-year.api.service';
import { NotificationService } from '../../core/notify/notification.service';

/**
 * Fiscal Years — list the accounting years and close one. Closing posts a balanced
 * voucher that sweeps the year's net profit into Retained Earnings and locks the
 * period.
 */
@Component({
  selector: 'erp-fiscal-year',
  imports: [AgGridAngular],
  template: `
    <div class="mb-3"><div class="text-muted small">Accounting</div><h4 class="mb-0">Fiscal Years</h4></div>
    <p class="text-muted small mb-3" style="max-width:620px">
      Closing a year moves its net profit into Retained Earnings, resets the current-period
      profit, and freezes postings up to the year-end date.
    </p>
    <ag-grid-angular
      [theme]="theme" [rowData]="rows()" [columnDefs]="colDefs" [defaultColDef]="defaultColDef"
      [context]="ctx" style="height: calc(100vh - 260px); width: 100%" />
  `,
})
export class FiscalYearComponent {
  private readonly api = inject(FiscalYearApiService);
  private readonly notify = inject(NotificationService);

  protected readonly theme = themeQuartz;
  protected readonly rows = signal<FiscalYear[]>([]);
  protected readonly ctx = { close: (fy: FiscalYear) => this.close(fy) };

  protected readonly defaultColDef: ColDef = { sortable: true, filter: false, resizable: true, flex: 1 };
  protected readonly colDefs: ColDef<FiscalYear>[] = [
    { headerName: 'Fiscal Year', field: 'name', minWidth: 140,
      cellRenderer: (p: ICellRendererParams<FiscalYear>) => `${p.value}${p.data?.isDefault ? ' <span style="color:var(--erp-text-muted);font-size:11px">· default</span>' : ''}` },
    { headerName: 'Start', field: 'startDate', minWidth: 120 },
    { headerName: 'End', field: 'endDate', minWidth: 120 },
    {
      headerName: 'Status', field: 'closed', minWidth: 110,
      cellRenderer: (p: ICellRendererParams<FiscalYear>) =>
        p.value
          ? `<span style="background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;border-radius:999px;padding:1px 10px;font-size:12px">Closed</span>`
          : `<span style="background:#dcfce7;border:1px solid #86efac;color:#166534;border-radius:999px;padding:1px 10px;font-size:12px">Open</span>`,
    },
    {
      headerName: '', minWidth: 150, sortable: false, cellClass: 'text-end',
      cellRenderer: (p: ICellRendererParams<FiscalYear>) =>
        p.data?.closed ? '' : `<button class="btn btn-sm btn-light text-danger">Close year</button>`,
      onCellClicked: (e) => { if (e.data && !e.data.closed) (e.context as { close: (fy: FiscalYear) => void }).close(e.data); },
    },
  ];

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.list().subscribe((f) => this.rows.set(f));
  }

  private close(fy: FiscalYear): void {
    if (!confirm(`Close ${fy.name}? This posts the year-end closing entry and locks postings up to ${fy.endDate}.`)) return;
    this.api.close(fy.id).subscribe({
      next: (r) => {
        this.notify.success(r.closed ? `${fy.name} closed (net ₹${r.netProfit})` : `${fy.name} was already closed`);
        this.load();
      },
      error: (e: { error?: { error?: { message?: string } } }) => this.notify.error(e?.error?.error?.message ?? 'Close failed'),
    });
  }
}

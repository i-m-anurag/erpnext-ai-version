import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { type CellClickedEvent, type ColDef, type GridReadyEvent, type ValueFormatterParams, themeQuartz } from 'ag-grid-community';
import { LedgerApiService, type DayBookRow } from '../../core/api/ledger.api.service';
import { routeForMaster } from '../../core/config/view-configs';
import { formatDateTime } from '../../core/util/format';

/** ₹ with Indian grouping (lakh/crore). Blank for zero. */
function inr(v: unknown): string {
  const n = Number(v);
  if (!n) return '';
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const today = (): string => {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * General Ledger (Day Book) — every posting across all accounts, newest first, in an
 * ag-grid with per-column filters. It loads today's entries by default; change the date
 * to see another day, or clear it to see everything. The voucher cell links to its
 * source transaction. A CoA drill-down (?account=CODE) pre-filters the Account column.
 */
@Component({
  selector: 'erp-general-ledger',
  imports: [FormsModule, AgGridAngular],
  template: `
    <div class="d-flex align-items-end justify-content-between mb-3 flex-wrap gap-2">
      <div>
        <div class="text-muted small">Accounting</div>
        <h4 class="mb-0">General Ledger</h4>
      </div>
      <div class="d-flex align-items-end gap-3 flex-wrap">
        <div>
          <label class="erp-field__label form-label">Date</label>
          <input type="date" class="form-control form-control-sm" [(ngModel)]="date" (ngModelChange)="load()" />
        </div>
        <button class="btn btn-sm btn-outline-secondary" (click)="clearDate()">All dates</button>
      </div>
    </div>

    <ag-grid-angular
      [theme]="theme"
      [rowData]="rows()"
      [columnDefs]="colDefs"
      [defaultColDef]="defaultColDef"
      (gridReady)="onGridReady($event)"
      (cellClicked)="onCellClicked($event)"
      style="height: calc(100vh - 220px); width: 100%"
    />
  `,
})
export class GeneralLedgerComponent {
  private readonly ledger = inject(LedgerApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected date = today();
  protected readonly theme = themeQuartz;
  protected readonly rows = signal<DayBookRow[]>([]);
  private readonly accountFilter = this.route.snapshot.queryParamMap.get('account') ?? '';

  protected readonly defaultColDef: ColDef = { sortable: true, filter: true, floatingFilter: true, resizable: true, flex: 1 };

  protected readonly colDefs: ColDef<DayBookRow>[] = [
    { headerName: 'Date', field: 'postingDate', minWidth: 160, valueFormatter: (p: ValueFormatterParams) => formatDateTime(p.value) },
    { headerName: 'Account', field: 'accountName', minWidth: 160 },
    {
      headerName: 'Voucher', field: 'voucherNo', minWidth: 150,
      cellStyle: { color: '#2f6fed', cursor: 'pointer', textDecoration: 'underline' },
    },
    { headerName: 'Against', field: 'against', minWidth: 140 },
    { headerName: 'Party', field: 'party', minWidth: 120 },
    {
      headerName: 'Debit', field: 'debit', type: 'rightAligned', minWidth: 130,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: { color: '#dc2626', fontVariantNumeric: 'tabular-nums' },
    },
    {
      headerName: 'Credit', field: 'credit', type: 'rightAligned', minWidth: 130,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: { color: '#16a34a', fontVariantNumeric: 'tabular-nums' },
    },
  ];

  constructor() {
    // A CoA drill-down passes ?account=CODE — show that account's full history (all dates).
    if (this.accountFilter) this.date = '';
    this.load();
  }

  /** Load every posting for the chosen date (or all dates when the date is cleared). */
  protected load(): void {
    const d = this.date || undefined;
    this.ledger.dayBook(d, d).subscribe({
      next: (r) => this.rows.set(r.rows),
      error: () => this.rows.set([]),
    });
  }

  protected clearDate(): void {
    this.date = '';
    this.load();
  }

  /** Apply the CoA drill-down as an Account-column filter once the grid is ready. */
  protected onGridReady(e: GridReadyEvent<DayBookRow>): void {
    if (!this.accountFilter) return;
    const match = this.rows().find((r) => r.account === this.accountFilter);
    e.api.setColumnFilterModel('accountName', { filterType: 'text', type: 'equals', filter: match?.accountName ?? this.accountFilter })
      .then(() => e.api.onFilterChanged());
  }

  /** Voucher cell → the source transaction's record page. */
  protected onCellClicked(e: CellClickedEvent<DayBookRow>): void {
    if (e.colDef.field !== 'voucherNo' || !e.data) return;
    const route = routeForMaster(e.data.voucherType);
    if (route) void this.router.navigate(['/app/m', route[0], route[1], e.data.voucherNo]);
  }
}

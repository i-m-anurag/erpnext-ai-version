import { Component, inject, signal } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { type ColDef, type ValueFormatterParams, themeQuartz } from 'ag-grid-community';
import { StockApiService, type StockBalanceRow, type StockReconciliation } from '../../core/api/stock.api.service';

/** ₹ with Indian grouping. Blank for zero. */
function inr(v: unknown): string {
  const n = Number(v);
  if (!n) return '';
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const qty = (v: unknown): string => {
  const n = Number(v);
  return n ? n.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '0';
};

/**
 * Stock Levels — what is on hand right now, per item and warehouse, with its
 * moving-average valuation. Read straight from the latest ledger row for each
 * (item, warehouse), so it can never drift from the movements that produced it.
 */
@Component({
  selector: 'erp-stock-levels',
  imports: [AgGridAngular],
  template: `
    <div class="d-flex align-items-end justify-content-between mb-3">
      <div><div class="text-muted small">Inventory</div><h4 class="mb-0">Stock Levels</h4></div>
      <div class="text-end">
        <div class="text-muted small">Total stock value</div>
        <div class="fs-5 fw-semibold">{{ totalValue() }}</div>
      </div>
    </div>

    @if (recon(); as r) {
      <div
        class="d-flex flex-wrap align-items-center gap-3 small border rounded px-3 py-2 mb-3"
        [class.border-danger]="!r.inSync" [class.text-danger]="!r.inSync"
      >
        <span>
          <i class="ph" [class.ph-check-circle]="r.inSync" [class.ph-warning-circle]="!r.inSync"></i>
          {{ r.inSync ? 'Stock ledger agrees with the books' : 'Stock ledger and books disagree' }}
        </span>
        <span class="text-muted">Stock ledger <span class="fw-semibold">{{ money(r.stockLedgerValue) }}</span></span>
        <span class="text-muted">Stock In Hand <span class="fw-semibold">{{ money(r.generalLedgerValue) }}</span></span>
        @if (!r.inSync) {
          <span>Difference <span class="fw-semibold">{{ money(r.difference) }}</span></span>
          @if (r.unpostedVouchers.length) {
            <span>· not posted to the GL: {{ unpostedList(r) }}</span>
          }
        }
      </div>
    }

    <ag-grid-angular
      [theme]="theme" [rowData]="rows()" [columnDefs]="colDefs" [defaultColDef]="defaultColDef"
      style="height: calc(100vh - 265px); width: 100%" />
  `,
})
export class StockLevelsComponent {
  private readonly api = inject(StockApiService);
  protected readonly theme = themeQuartz;
  protected readonly rows = signal<StockBalanceRow[]>([]);
  protected readonly totalValue = signal('₹0.00');
  protected readonly recon = signal<StockReconciliation | null>(null);

  protected readonly defaultColDef: ColDef = { sortable: true, filter: true, resizable: true, flex: 1 };
  protected readonly colDefs: ColDef<StockBalanceRow>[] = [
    { headerName: 'Item', field: 'itemCode', minWidth: 160 },
    { headerName: 'Warehouse', field: 'warehouse', minWidth: 160 },
    {
      headerName: 'Qty', field: 'qty', type: 'rightAligned', minWidth: 110,
      valueFormatter: (p: ValueFormatterParams) => qty(p.value),
      cellStyle: { fontVariantNumeric: 'tabular-nums' },
    },
    {
      headerName: 'Valuation Rate', field: 'valuationRate', type: 'rightAligned', minWidth: 140,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: { fontVariantNumeric: 'tabular-nums' },
    },
    {
      headerName: 'Stock Value', field: 'stockValue', type: 'rightAligned', minWidth: 150,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: { fontWeight: '600', fontVariantNumeric: 'tabular-nums' },
    },
  ];

  constructor() {
    this.api.balances().subscribe((b) => {
      this.rows.set(b.rows);
      this.totalValue.set(inr(b.totalValue) || '₹0.00');
    });
    this.api.reconciliation().subscribe((r) => this.recon.set(r));
  }

  /** Zero is a real figure here, not a blank — ₹0.00 is what "in sync" looks like. */
  protected money(v: string): string {
    return inr(v) || '₹0.00';
  }

  /** The first few offending vouchers; the report is a prompt to investigate, not a list. */
  protected unpostedList(r: StockReconciliation): string {
    const shown = r.unpostedVouchers.slice(0, 3).map((v) => v.voucherNo).join(', ');
    const rest = r.unpostedVouchers.length - 3;
    return rest > 0 ? `${shown} and ${rest} more` : shown;
  }
}

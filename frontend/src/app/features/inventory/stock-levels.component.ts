import { Component, inject, signal } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { type ColDef, type ValueFormatterParams, themeQuartz } from 'ag-grid-community';
import { StockApiService, type StockBalanceRow } from '../../core/api/stock.api.service';

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
    <ag-grid-angular
      [theme]="theme" [rowData]="rows()" [columnDefs]="colDefs" [defaultColDef]="defaultColDef"
      style="height: calc(100vh - 210px); width: 100%" />
  `,
})
export class StockLevelsComponent {
  private readonly api = inject(StockApiService);
  protected readonly theme = themeQuartz;
  protected readonly rows = signal<StockBalanceRow[]>([]);
  protected readonly totalValue = signal('₹0.00');

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
  }
}

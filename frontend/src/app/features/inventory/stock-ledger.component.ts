import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { type CellClickedEvent, type ColDef, type ValueFormatterParams, themeQuartz } from 'ag-grid-community';
import { StockApiService, type StockLedgerRow } from '../../core/api/stock.api.service';
import { routeForMaster } from '../../core/config/view-configs';
import { formatDateTime } from '../../core/util/format';

function inr(v: unknown): string {
  const n = Number(v);
  if (!n) return '';
  return (n < 0 ? '-₹' : '₹') + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const num = (v: unknown, dp = 3): string => {
  const n = Number(v);
  return n ? n.toLocaleString('en-IN', { maximumFractionDigits: dp }) : '0';
};
/** 'purchase-receipt' → 'Purchase Receipt' */
const titleCase = (slug: string): string =>
  slug.split('-').map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ');

/**
 * Stock Ledger — every movement, newest first. In (green) and out (red) mirror the
 * debit/credit colouring of the General Ledger, and the voucher links to the document
 * that caused the movement.
 */
@Component({
  selector: 'erp-stock-ledger',
  imports: [AgGridAngular],
  template: `
    <div class="mb-3"><div class="text-muted small">Inventory</div><h4 class="mb-0">Stock Ledger</h4></div>
    <ag-grid-angular
      [theme]="theme" [rowData]="rows()" [columnDefs]="colDefs" [defaultColDef]="defaultColDef"
      (cellClicked)="onCellClicked($event)"
      style="height: calc(100vh - 190px); width: 100%" />
  `,
})
export class StockLedgerComponent {
  private readonly api = inject(StockApiService);
  private readonly router = inject(Router);
  protected readonly theme = themeQuartz;
  protected readonly rows = signal<StockLedgerRow[]>([]);

  protected readonly defaultColDef: ColDef = { sortable: true, filter: true, resizable: true, flex: 1 };
  protected readonly colDefs: ColDef<StockLedgerRow>[] = [
    {
      headerName: 'Date', field: 'postingDate', minWidth: 160,
      valueFormatter: (p: ValueFormatterParams) => formatDateTime(p.value),
    },
    { headerName: 'Item', field: 'itemCode', minWidth: 140 },
    { headerName: 'Warehouse', field: 'warehouse', minWidth: 140 },
    {
      headerName: 'Qty Change', field: 'actualQty', type: 'rightAligned', minWidth: 120,
      valueFormatter: (p: ValueFormatterParams) => num(p.value),
      cellStyle: (p) => ({
        color: Number(p.value) < 0 ? '#dc2626' : '#16a34a',
        fontVariantNumeric: 'tabular-nums',
      }),
    },
    {
      headerName: 'Balance Qty', field: 'qtyAfterTransaction', type: 'rightAligned', minWidth: 120,
      valueFormatter: (p: ValueFormatterParams) => num(p.value),
      cellStyle: { fontVariantNumeric: 'tabular-nums' },
    },
    {
      headerName: 'Val. Rate', field: 'valuationRate', type: 'rightAligned', minWidth: 120,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: { fontVariantNumeric: 'tabular-nums' },
    },
    {
      headerName: 'Value Change', field: 'stockValueDifference', type: 'rightAligned', minWidth: 140,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: (p) => ({
        color: Number(p.value) < 0 ? '#dc2626' : '#16a34a',
        fontVariantNumeric: 'tabular-nums',
      }),
    },
    {
      headerName: 'Balance Value', field: 'stockValue', type: 'rightAligned', minWidth: 140,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: { fontWeight: '600', fontVariantNumeric: 'tabular-nums' },
    },
    {
      // voucherType is the doctype slug ('purchase-receipt'); show it the way the
      // rest of the UI names documents.
      headerName: 'Type', field: 'voucherType', minWidth: 150,
      valueFormatter: (p: ValueFormatterParams) => titleCase(String(p.value ?? '')),
    },
    {
      headerName: 'Voucher', field: 'voucherNo', minWidth: 160,
      cellStyle: { color: 'var(--erp-primary, #4f46e5)', cursor: 'pointer', textDecoration: 'underline' },
    },
  ];

  constructor() {
    this.api.ledger().subscribe((r) => this.rows.set(r));
  }

  /** Jump to the document that caused the movement. */
  protected onCellClicked(e: CellClickedEvent<StockLedgerRow>): void {
    if (e.colDef.field !== 'voucherNo' || !e.data) return;
    const route = routeForMaster(e.data.voucherType);
    if (route) void this.router.navigate(['/app/m', route[0], route[1], e.data.voucherNo]);
  }
}

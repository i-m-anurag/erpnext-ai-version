import { Component, inject, signal } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { type ColDef, type ValueFormatterParams, themeQuartz } from 'ag-grid-community';
import { LedgerApiService, type BalanceSheet } from '../../core/api/ledger.api.service';

interface StmtRow { section: string; name: string; amount: string; subtotal: boolean; }

function inr(v: unknown): string {
  const n = Number(v);
  if (!n) return '₹0.00';
  return (n < 0 ? '-₹' : '₹') + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Balance Sheet — Assets vs Liabilities + Equity (net profit folded into equity),
 *  on ag-grid, with a balanced/out-of-balance badge. */
@Component({
  selector: 'erp-balance-sheet',
  imports: [AgGridAngular],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div><div class="text-muted small">Accounting</div><h4 class="mb-0">Balance Sheet</h4></div>
      @if (bs(); as b) {
        @if (b.balanced) { <span class="iq-badge iq-badge--ok">balanced</span> }
        @else { <span class="iq-badge iq-badge--no">out of balance</span> }
      }
    </div>
    <ag-grid-angular
      [theme]="theme" [rowData]="rows()" [columnDefs]="colDefs" [defaultColDef]="defaultColDef"
      [pinnedBottomRowData]="totalRow()" [getRowStyle]="rowStyle"
      style="height: calc(100vh - 210px); width: 100%" />
  `,
  styles: [`
    .iq-badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 500; }
    .iq-badge--ok { background: #dcfce7; border: 1px solid #86efac; color: #166534; }
    .iq-badge--no { background: #fee2e2; border: 1px solid #fca5a5; color: #991b1b; }
  `],
})
export class BalanceSheetComponent {
  private readonly ledger = inject(LedgerApiService);
  protected readonly theme = themeQuartz;
  protected readonly bs = signal<BalanceSheet | undefined>(undefined);
  protected readonly rows = signal<StmtRow[]>([]);
  protected readonly totalRow = signal<StmtRow[]>([]);

  protected readonly defaultColDef: ColDef = { sortable: false, filter: false, resizable: true, flex: 1 };
  protected readonly colDefs: ColDef<StmtRow>[] = [
    { headerName: 'Section', field: 'section', minWidth: 120, maxWidth: 160 },
    { headerName: 'Account', field: 'name', minWidth: 260,
      cellStyle: (p) => ({ fontWeight: p.data?.subtotal || p.node.rowPinned ? '700' : '400' }) },
    { headerName: 'Amount', field: 'amount', type: 'rightAligned', minWidth: 160,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: (p) => ({
        fontWeight: p.data?.subtotal || p.node.rowPinned ? '700' : '400',
        color: Number(p.value) < 0 ? '#dc2626' : 'inherit',
        fontVariantNumeric: 'tabular-nums',
      }) },
  ];

  protected readonly rowStyle = (p: { data?: StmtRow }) =>
    p.data?.subtotal ? { background: 'var(--erp-surface-alt)' } : undefined;

  constructor() {
    this.ledger.balanceSheet().subscribe((b) => this.build(b));
  }

  private build(b: BalanceSheet): void {
    const rows: StmtRow[] = [];
    for (const r of b.assets) rows.push({ section: 'Assets', name: r.name, amount: r.amount, subtotal: false });
    rows.push({ section: 'Assets', name: 'Total Assets', amount: b.totalAssets, subtotal: true });
    for (const r of b.liabilities) rows.push({ section: 'Liabilities', name: r.name, amount: r.amount, subtotal: false });
    rows.push({ section: 'Liabilities', name: 'Total Liabilities', amount: b.totalLiabilities, subtotal: true });
    for (const r of b.equity) rows.push({ section: 'Equity', name: r.name, amount: r.amount, subtotal: false });
    rows.push({ section: 'Equity', name: 'Total Equity', amount: b.totalEquity, subtotal: true });
    this.bs.set(b);
    this.rows.set(rows);
    this.totalRow.set([{ section: '', name: 'Total Liabilities + Equity', amount: b.totalLiabilitiesEquity, subtotal: true }]);
  }
}

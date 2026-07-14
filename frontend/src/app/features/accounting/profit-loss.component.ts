import { Component, inject, signal } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { type ColDef, type ValueFormatterParams, themeQuartz } from 'ag-grid-community';
import { LedgerApiService, type ProfitAndLoss } from '../../core/api/ledger.api.service';

interface StmtRow { section: string; name: string; amount: string; subtotal: boolean; }

/** ₹ with Indian grouping (keeps the sign for losses). */
function inr(v: unknown): string {
  const n = Number(v);
  if (!n) return '₹0.00';
  return (n < 0 ? '-₹' : '₹') + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Profit & Loss statement — Income and Expense sections with subtotals and a
 *  pinned Net Profit line, on ag-grid (structured statement → no column filters). */
@Component({
  selector: 'erp-profit-loss',
  imports: [AgGridAngular],
  template: `
    <div class="mb-3"><div class="text-muted small">Accounting</div><h4 class="mb-0">Profit &amp; Loss</h4></div>
    <ag-grid-angular
      [theme]="theme" [rowData]="rows()" [columnDefs]="colDefs" [defaultColDef]="defaultColDef"
      [pinnedBottomRowData]="netRow()" [getRowStyle]="rowStyle"
      style="height: calc(100vh - 210px); width: 100%" />
  `,
})
export class ProfitLossComponent {
  private readonly ledger = inject(LedgerApiService);
  protected readonly theme = themeQuartz;
  protected readonly rows = signal<StmtRow[]>([]);
  protected readonly netRow = signal<StmtRow[]>([]);

  protected readonly defaultColDef: ColDef = { sortable: false, filter: false, resizable: true, flex: 1 };
  protected readonly colDefs: ColDef<StmtRow>[] = [
    { headerName: 'Section', field: 'section', minWidth: 120, maxWidth: 160 },
    { headerName: 'Account', field: 'name', minWidth: 240,
      cellStyle: (p) => ({ fontWeight: p.data?.subtotal || p.node.rowPinned ? '700' : '400' }) },
    { headerName: 'Amount', field: 'amount', type: 'rightAligned', minWidth: 160,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: (p) => ({
        fontWeight: p.data?.subtotal || p.node.rowPinned ? '700' : '400',
        color: Number(p.value) < 0 ? '#dc2626' : '#16a34a',
        fontVariantNumeric: 'tabular-nums',
      }) },
  ];

  protected readonly rowStyle = (p: { data?: StmtRow }) =>
    p.data?.subtotal ? { background: 'var(--erp-surface-alt)' } : undefined;

  constructor() {
    this.ledger.profitAndLoss().subscribe((pl) => this.build(pl));
  }

  private build(pl: ProfitAndLoss): void {
    const rows: StmtRow[] = [];
    for (const r of pl.income) rows.push({ section: 'Income', name: r.name, amount: r.amount, subtotal: false });
    rows.push({ section: 'Income', name: 'Total Income', amount: pl.totalIncome, subtotal: true });
    for (const r of pl.expense) rows.push({ section: 'Expense', name: r.name, amount: r.amount, subtotal: false });
    rows.push({ section: 'Expense', name: 'Total Expenses', amount: pl.totalExpense, subtotal: true });
    this.rows.set(rows);
    this.netRow.set([{ section: '', name: Number(pl.netProfit) < 0 ? 'Net Loss' : 'Net Profit', amount: pl.netProfit, subtotal: true }]);
  }
}

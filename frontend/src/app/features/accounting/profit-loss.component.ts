import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import { type ColDef, type ValueFormatterParams, themeQuartz } from 'ag-grid-community';
import { LedgerApiService, type ProfitAndLoss } from '../../core/api/ledger.api.service';
import { FiscalYearApiService, type FiscalYear } from '../../core/api/fiscal-year.api.service';

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
  imports: [AgGridAngular, FormsModule],
  template: `
    <div class="d-flex align-items-end justify-content-between mb-3 flex-wrap gap-2">
      <div><div class="text-muted small">Accounting</div><h4 class="mb-0">Profit &amp; Loss</h4></div>
      <div>
        <label class="erp-field__label form-label">Fiscal year</label>
        <select class="form-select form-select-sm" style="min-width:200px" [(ngModel)]="selected" (ngModelChange)="load()">
          <option value="">All time</option>
          @for (fy of fiscalYears(); track fy.id) { <option [value]="fy.id">{{ fy.name }}@if (fy.closed) { (closed) }</option> }
        </select>
      </div>
    </div>
    <ag-grid-angular
      [theme]="theme" [rowData]="rows()" [columnDefs]="colDefs" [defaultColDef]="defaultColDef"
      [pinnedBottomRowData]="netRow()" [getRowStyle]="rowStyle"
      style="height: calc(100vh - 210px); width: 100%" />
  `,
})
export class ProfitLossComponent {
  private readonly ledger = inject(LedgerApiService);
  private readonly fyApi = inject(FiscalYearApiService);
  protected readonly theme = themeQuartz;
  protected readonly rows = signal<StmtRow[]>([]);
  protected readonly netRow = signal<StmtRow[]>([]);
  protected readonly fiscalYears = signal<FiscalYear[]>([]);
  protected selected = '';

  protected readonly defaultColDef: ColDef = { sortable: false, filter: false, resizable: true, flex: 1 };
  protected readonly colDefs: ColDef<StmtRow>[] = [
    { headerName: 'Section', field: 'section', minWidth: 120, maxWidth: 160 },
    { headerName: 'Account', field: 'name', minWidth: 240,
      cellStyle: (p) => ({ fontWeight: p.data?.subtotal || p.node.rowPinned ? '700' : '400' }) },
    { headerName: 'Amount', field: 'amount', type: 'rightAligned', minWidth: 160,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: (p) => {
        // Income green, Expense red; the Net line (no section) goes by sign.
        const s = p.data?.section;
        const color = s === 'Expense' ? '#dc2626' : s === 'Income' ? '#16a34a' : (Number(p.value) < 0 ? '#dc2626' : '#16a34a');
        return { fontWeight: p.data?.subtotal || p.node.rowPinned ? '700' : '400', color, fontVariantNumeric: 'tabular-nums' };
      } },
  ];

  protected readonly rowStyle = (p: { data?: StmtRow }) =>
    p.data?.subtotal ? { background: 'var(--erp-surface-alt)' } : undefined;

  constructor() {
    this.fyApi.list().subscribe((f) => this.fiscalYears.set(f));
    this.load();
  }

  protected load(): void {
    const fy = this.fiscalYears().find((f) => f.id === this.selected);
    this.ledger.profitAndLoss(fy?.startDate, fy?.endDate).subscribe((pl) => this.build(pl));
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

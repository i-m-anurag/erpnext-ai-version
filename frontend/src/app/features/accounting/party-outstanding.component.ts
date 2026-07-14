import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { type ColDef, type ValueFormatterParams, themeQuartz } from 'ag-grid-community';
import { LedgerApiService, type PartyOutstandingRow } from '../../core/api/ledger.api.service';

function inr(v: unknown): string {
  const n = Number(v);
  if (!n) return '₹0.00';
  return (n < 0 ? '-₹' : '₹') + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Party-wise outstanding (Accounts Payable / Receivable) on ag-grid — one row per
 * party with its net balance, plus a pinned total. `kind` picks the report.
 */
@Component({
  selector: 'erp-party-outstanding',
  imports: [AgGridAngular],
  template: `
    <div class="mb-3"><div class="text-muted small">Accounting</div><h4 class="mb-0">{{ title() }}</h4></div>
    <ag-grid-angular
      [theme]="theme" [rowData]="rows()" [columnDefs]="colDefs" [defaultColDef]="defaultColDef"
      [pinnedBottomRowData]="totalRow()"
      style="height: calc(100vh - 210px); width: 100%" />
  `,
})
export class PartyOutstandingComponent {
  /** 'payables' | 'receivables' */
  readonly kind = input.required<string>();

  private readonly ledger = inject(LedgerApiService);
  protected readonly theme = themeQuartz;
  protected readonly rows = signal<PartyOutstandingRow[]>([]);

  protected readonly title = computed(() => (this.kind() === 'receivables' ? 'Accounts Receivable' : 'Accounts Payable'));
  protected readonly totalRow = computed(() => {
    const rows = this.rows();
    const sum = (k: keyof PartyOutstandingRow): string =>
      String(rows.reduce((s, r) => s + Number(r[k]), 0));
    return [{
      party: 'Total', current: sum('current'), days30: sum('days30'),
      days60: sum('days60'), days90Plus: sum('days90Plus'), total: sum('total'),
    }];
  });

  protected readonly defaultColDef: ColDef = { sortable: true, filter: false, resizable: true, flex: 1 };
  private readonly amt = (p: ValueFormatterParams): string => inr(p.value);
  private readonly bold = (p: { node: { rowPinned?: string | null } }) => ({
    fontWeight: p.node.rowPinned ? '700' : '400', fontVariantNumeric: 'tabular-nums',
  });
  protected readonly colDefs: ColDef<PartyOutstandingRow>[] = [
    { headerName: 'Party', field: 'party', minWidth: 200, filter: true, floatingFilter: true,
      cellStyle: (p) => ({ fontWeight: p.node.rowPinned ? '700' : '400' }) },
    { headerName: 'Current', field: 'current', type: 'rightAligned', valueFormatter: this.amt, cellStyle: this.bold },
    { headerName: '31–60', field: 'days30', type: 'rightAligned', valueFormatter: this.amt, cellStyle: this.bold },
    { headerName: '61–90', field: 'days60', type: 'rightAligned', valueFormatter: this.amt, cellStyle: this.bold },
    { headerName: '90+', field: 'days90Plus', type: 'rightAligned', valueFormatter: this.amt, cellStyle: this.bold },
    { headerName: 'Total', field: 'total', type: 'rightAligned', minWidth: 140,
      valueFormatter: this.amt,
      cellStyle: (p) => ({ fontWeight: '700', fontVariantNumeric: 'tabular-nums' }) },
  ];

  constructor() {
    effect(() => {
      const req = this.kind() === 'receivables' ? this.ledger.receivables() : this.ledger.payables();
      req.subscribe((rows) => this.rows.set(rows));
    });
  }
}

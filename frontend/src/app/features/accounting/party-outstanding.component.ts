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
    const total = this.rows().reduce((s, r) => s + Number(r.outstanding), 0);
    return [{ party: 'Total', outstanding: String(total) }];
  });

  protected readonly defaultColDef: ColDef = { sortable: true, filter: true, floatingFilter: true, resizable: true, flex: 1 };
  protected readonly colDefs: ColDef<PartyOutstandingRow>[] = [
    { headerName: 'Party', field: 'party', minWidth: 240,
      cellStyle: (p) => ({ fontWeight: p.node.rowPinned ? '700' : '400' }) },
    { headerName: 'Outstanding', field: 'outstanding', type: 'rightAligned', minWidth: 180,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: (p) => ({ fontWeight: p.node.rowPinned ? '700' : '400', fontVariantNumeric: 'tabular-nums' }) },
  ];

  constructor() {
    effect(() => {
      const req = this.kind() === 'receivables' ? this.ledger.receivables() : this.ledger.payables();
      req.subscribe((rows) => this.rows.set(rows));
    });
  }
}

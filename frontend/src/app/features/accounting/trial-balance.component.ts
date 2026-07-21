import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { type CellClickedEvent, type ColDef, type ValueFormatterParams, themeQuartz } from 'ag-grid-community';
import { LedgerApiService, type TrialBalance, type TrialBalanceRow } from '../../core/api/ledger.api.service';

/** ₹ with Indian grouping. Blank for zero. */
function inr(v: unknown): string {
  const n = Number(v);
  if (!n) return '';
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Trial Balance — every account's debit/credit totals in an ag-grid, with the grand
 * totals pinned at the bottom and a balanced/out-of-balance badge. Each account name
 * links to its General Ledger.
 */
@Component({
  selector: 'erp-trial-balance',
  imports: [AgGridAngular],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <div class="text-muted small">Accounting</div>
        <h4 class="mb-0">Trial Balance</h4>
      </div>
      @if (tb()) {
        @if (balanced()) { <span class="iq-badge iq-badge--ok">balanced</span> }
        @else { <span class="iq-badge iq-badge--no">out of balance</span> }
      }
    </div>

    <ag-grid-angular
      [theme]="theme"
      [rowData]="rows()"
      [columnDefs]="colDefs"
      [defaultColDef]="defaultColDef"
      [pinnedBottomRowData]="totalRow()"
      (cellClicked)="onCellClicked($event)"
      style="height: calc(100vh - 210px); width: 100%"
    />
  `,
  styles: [`
    .iq-badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 500; }
    .iq-badge--ok { background: #dcfce7; border: 1px solid #86efac; color: #166534; }
    .iq-badge--no { background: #fee2e2; border: 1px solid #fca5a5; color: #991b1b; }
  `],
})
export class TrialBalanceComponent {
  private readonly ledger = inject(LedgerApiService);
  private readonly router = inject(Router);

  protected readonly theme = themeQuartz;
  protected readonly tb = signal<TrialBalance | undefined>(undefined);
  protected readonly rows = computed(() => this.tb()?.rows ?? []);
  protected readonly balanced = computed(() => {
    const t = this.tb();
    return !!t && Number(t.totalDebit) === Number(t.totalCredit);
  });
  protected readonly totalRow = computed(() => {
    const t = this.tb();
    return t ? [{ account: '', name: 'Total', rootType: '', debit: t.totalDebit, credit: t.totalCredit }] : [];
  });

  protected readonly defaultColDef: ColDef = { sortable: true, filter: true, floatingFilter: true, resizable: true, flex: 1 };

  protected readonly colDefs: ColDef<TrialBalanceRow>[] = [
    {
      headerName: 'Account', field: 'name', minWidth: 220,
      cellStyle: (p) => p.node.rowPinned
        ? { fontWeight: '700', color: 'inherit', cursor: 'default', textDecoration: 'none' }
        : { fontWeight: '400', color: '#2f6fed', cursor: 'pointer', textDecoration: 'underline' },
    },
    { headerName: 'Root', field: 'rootType', minWidth: 120 },
    {
      headerName: 'Debit', field: 'debit', type: 'rightAligned', minWidth: 150,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: (p) => ({ color: '#dc2626', fontVariantNumeric: 'tabular-nums', fontWeight: p.node.rowPinned ? 700 : 400 }),
    },
    {
      headerName: 'Credit', field: 'credit', type: 'rightAligned', minWidth: 150,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: (p) => ({ color: '#16a34a', fontVariantNumeric: 'tabular-nums', fontWeight: p.node.rowPinned ? 700 : 400 }),
    },
  ];

  constructor() {
    this.ledger.trialBalance().subscribe((t) => this.tb.set(t));
  }

  /** Account name → its General Ledger (skip the pinned total row). */
  protected onCellClicked(e: CellClickedEvent<TrialBalanceRow>): void {
    if (e.colDef.field !== 'name' || e.node.rowPinned || !e.data?.account) return;
    void this.router.navigate(['/app/m/finance/ledger'], { queryParams: { account: e.data.account } });
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { type CellClickedEvent, type ColDef, type ValueFormatterParams, type ValueGetterParams, themeQuartz } from 'ag-grid-community';
import { AccountApiService, type Account } from '../../core/api/account.api.service';
import { LedgerApiService, type GlReportRow } from '../../core/api/ledger.api.service';
import { routeForMaster } from '../../core/config/view-configs';

/** ₹ with Indian grouping (lakh/crore). Blank for zero. */
function inr(v: unknown): string {
  const n = Number(v);
  if (!n) return '';
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * General Ledger — postings for a chosen account with a running balance, in an
 * ag-grid (per-column filters, internal scroll). Rows are fetched server-side per
 * selected account; the voucher cell links to its source transaction.
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
      <div class="d-flex align-items-end gap-3">
        <div>
          <label class="erp-field__label form-label">Account</label>
          <select class="form-select form-select-sm" style="min-width:260px" [(ngModel)]="account" (ngModelChange)="load()">
            <option value="">— select an account —</option>
            @for (a of leaves(); track a.code) { <option [value]="a.code">{{ a.name }}</option> }
          </select>
        </div>
        @if (account) {
          <div class="text-end">
            <div class="erp-field__label form-label">Closing balance</div>
            <div class="fw-bold">{{ balanceLabel(closing()) }}</div>
          </div>
        }
      </div>
    </div>

    @if (account) {
      <ag-grid-angular
        [theme]="theme"
        [rowData]="rows()"
        [columnDefs]="colDefs"
        [defaultColDef]="defaultColDef"
        (cellClicked)="onCellClicked($event)"
        style="height: calc(100vh - 230px); width: 100%"
      />
    } @else {
      <div class="erp-card p-4 text-muted">Select an account to view its ledger.</div>
    }
  `,
})
export class GeneralLedgerComponent {
  private readonly accountsApi = inject(AccountApiService);
  private readonly ledger = inject(LedgerApiService);
  private readonly router = inject(Router);

  protected account = '';
  protected readonly theme = themeQuartz;
  protected readonly accounts = signal<Account[]>([]);
  protected readonly rows = signal<GlReportRow[]>([]);
  protected readonly closing = signal('0');
  protected readonly leaves = computed(() => this.accounts().filter((a) => !a.isGroup));

  /** Every column filterable + sortable, with a floating filter row (point 1). */
  protected readonly defaultColDef: ColDef = { sortable: true, filter: true, floatingFilter: true, resizable: true, flex: 1 };

  protected readonly colDefs: ColDef<GlReportRow>[] = [
    {
      headerName: 'Date',
      valueGetter: (p: ValueGetterParams<GlReportRow>) =>
        p.data ? new Date(p.data.postingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
      minWidth: 130,
    },
    {
      headerName: 'Voucher', field: 'voucherNo', minWidth: 150,
      cellStyle: { color: '#2f6fed', cursor: 'pointer', textDecoration: 'underline' },
    },
    { headerName: 'Against', field: 'against', minWidth: 140 },
    { headerName: 'Party', field: 'party', minWidth: 120 },
    {
      headerName: 'Debit', field: 'debit', type: 'rightAligned', minWidth: 130,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: { color: '#dc2626', fontVariantNumeric: 'tabular-nums' }, // debit = red
    },
    {
      headerName: 'Credit', field: 'credit', type: 'rightAligned', minWidth: 130,
      valueFormatter: (p: ValueFormatterParams) => inr(p.value),
      cellStyle: { color: '#16a34a', fontVariantNumeric: 'tabular-nums' }, // credit = green
    },
    {
      headerName: 'Balance', field: 'balance', type: 'rightAligned', minWidth: 140,
      valueFormatter: (p: ValueFormatterParams) => this.balanceLabel(String(p.value)),
      cellStyle: { fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
    },
  ];

  constructor() {
    this.accountsApi.list().subscribe((a) => this.accounts.set(a));
  }

  /** Server-side fetch of the selected account's ledger (point 2). */
  protected load(): void {
    if (!this.account) { this.rows.set([]); this.closing.set('0'); return; }
    this.ledger.generalLedger(this.account).subscribe({
      next: (r) => { this.rows.set(r.rows); this.closing.set(r.closing); },
      error: () => { this.rows.set([]); this.closing.set('0'); },
    });
  }

  /** Voucher cell → the source transaction's record page (point 5). */
  protected onCellClicked(e: CellClickedEvent<GlReportRow>): void {
    if (e.colDef.field !== 'voucherNo' || !e.data) return;
    const route = routeForMaster(e.data.voucherType);
    if (route) void this.router.navigate(['/app/m', route[0], route[1], e.data.voucherNo]);
  }

  /** Signed balance as "₹1,234.00 Dr" / "₹1,234.00 Cr". */
  protected balanceLabel(v: string): string {
    const n = Number(v);
    if (!n) return '₹0.00';
    return `${inr(n)} ${n > 0 ? 'Dr' : 'Cr'}`;
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AccountApiService, type Account } from '../../core/api/account.api.service';
import { LedgerApiService, type GlReportRow } from '../../core/api/ledger.api.service';

/**
 * General Ledger — every posting for a chosen account with a running balance.
 * Balances are Σ(debit − credit); the sign is shown as Dr (positive) / Cr (negative).
 */
@Component({
  selector: 'erp-general-ledger',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="d-flex align-items-end justify-content-between mb-3 flex-wrap gap-2">
      <div>
        <div class="text-muted small">Accounting</div>
        <h4 class="mb-0">General Ledger</h4>
      </div>
      <div>
        <label class="erp-field__label form-label">Account</label>
        <select class="form-select form-select-sm" style="min-width:260px" [(ngModel)]="account" (ngModelChange)="load()">
          <option value="">— select an account —</option>
          @for (a of leaves(); track a.code) { <option [value]="a.code">{{ a.name }}</option> }
        </select>
      </div>
    </div>

    <div class="erp-card p-0">
      <table class="gl">
        <thead>
          <tr><th>Date</th><th>Voucher</th><th>Against</th><th>Party</th>
            <th class="text-end">Debit</th><th class="text-end">Credit</th><th class="text-end">Balance</th></tr>
        </thead>
        <tbody>
          @for (r of rows(); track $index) {
            <tr>
              <td class="text-muted small">{{ r.postingDate | date: 'mediumDate' }}</td>
              <td class="iq-mono">{{ r.voucherNo }}</td>
              <td class="text-muted small">{{ r.against }}</td>
              <td>{{ r.party ?? '—' }}</td>
              <td class="text-end">{{ money(r.debit) }}</td>
              <td class="text-end">{{ money(r.credit) }}</td>
              <td class="text-end fw-semibold">{{ balance(r.balance) }}</td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="text-muted text-center py-4">
              @if (!account) { Select an account. } @else if (loading()) { <i class="ph ph-circle-notch"></i> Loading… } @else { No entries. }
            </td></tr>
          }
        </tbody>
        @if (rows().length) {
          <tfoot>
            <tr class="gl__total"><td colspan="6" class="text-end fw-semibold">Closing balance</td>
              <td class="text-end fw-bold">{{ balance(closing()) }}</td></tr>
          </tfoot>
        }
      </table>
    </div>
  `,
  styles: [`
    .gl { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .gl th { text-align: left; padding: 10px 14px; font-size: 0.72rem; text-transform: uppercase;
      letter-spacing: 0.03em; color: var(--erp-text-muted); border-bottom: 1px solid var(--erp-border); }
    .gl td { padding: 8px 14px; border-bottom: 1px solid var(--erp-border); }
    .gl__total td { border-top: 2px solid var(--erp-border); }
  `],
})
export class GeneralLedgerComponent {
  private readonly accountsApi = inject(AccountApiService);
  private readonly ledger = inject(LedgerApiService);

  protected account = '';
  protected readonly loading = signal(false);
  protected readonly accounts = signal<Account[]>([]);
  protected readonly rows = signal<GlReportRow[]>([]);
  protected readonly closing = signal('0');

  protected readonly leaves = computed(() => this.accounts().filter((a) => !a.isGroup));

  constructor() {
    this.accountsApi.list().subscribe((a) => this.accounts.set(a));
  }

  protected load(): void {
    if (!this.account) { this.rows.set([]); return; }
    this.loading.set(true);
    this.ledger.generalLedger(this.account).subscribe({
      next: (r) => { this.rows.set(r.rows); this.closing.set(r.closing); this.loading.set(false); },
      error: () => { this.rows.set([]); this.loading.set(false); },
    });
  }

  /** Format a plain amount (blank for zero). */
  protected money(v: string): string {
    const n = Number(v);
    return n === 0 ? '' : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  /** Format a signed running balance as "1,234.00 Dr" / "1,234.00 Cr". */
  protected balance(v: string): string {
    const n = Number(v);
    if (n === 0) return '0.00';
    const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${abs} ${n > 0 ? 'Dr' : 'Cr'}`;
  }
}

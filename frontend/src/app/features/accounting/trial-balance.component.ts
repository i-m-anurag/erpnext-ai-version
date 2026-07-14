import { Component, computed, inject, signal } from '@angular/core';
import { LedgerApiService, type TrialBalance } from '../../core/api/ledger.api.service';

/**
 * Trial Balance — every account with activity, its total debits and credits, and
 * the grand totals (which must be equal for a balanced ledger).
 */
@Component({
  selector: 'erp-trial-balance',
  imports: [],
  template: `
    <div class="mb-3">
      <div class="text-muted small">Accounting</div>
      <h4 class="mb-0">Trial Balance</h4>
    </div>

    <div class="erp-card p-0">
      <table class="tb">
        <thead>
          <tr><th>Account</th><th style="width:90px">Root</th>
            <th class="text-end" style="width:160px">Debit</th><th class="text-end" style="width:160px">Credit</th></tr>
        </thead>
        <tbody>
          @for (r of tb()?.rows ?? []; track r.account) {
            <tr>
              <td>{{ r.name }}</td>
              <td class="text-muted small">{{ r.rootType }}</td>
              <td class="text-end">{{ money(r.debit) }}</td>
              <td class="text-end">{{ money(r.credit) }}</td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="text-muted text-center py-4">
              @if (loading()) { <i class="ph ph-circle-notch"></i> Loading… } @else { No ledger activity yet. }
            </td></tr>
          }
        </tbody>
        @if (tb(); as t) {
          <tfoot>
            <tr class="tb__total">
              <td colspan="2" class="fw-semibold">Total @if (balanced()) { <span class="iq-badge iq-badge--ok">balanced</span> } @else { <span class="iq-badge iq-badge--no">out of balance</span> }</td>
              <td class="text-end fw-bold">{{ money(t.totalDebit) }}</td>
              <td class="text-end fw-bold">{{ money(t.totalCredit) }}</td>
            </tr>
          </tfoot>
        }
      </table>
    </div>
  `,
  styles: [`
    .tb { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .tb th { text-align: left; padding: 10px 14px; font-size: 0.72rem; text-transform: uppercase;
      letter-spacing: 0.03em; color: var(--erp-text-muted); border-bottom: 1px solid var(--erp-border); }
    .tb td { padding: 8px 14px; border-bottom: 1px solid var(--erp-border); }
    .tb__total td { border-top: 2px solid var(--erp-border); }
    .iq-badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 0.72rem; margin-left: 6px; }
    .iq-badge--ok { background: #dcfce7; border: 1px solid #86efac; color: #166534; }
    .iq-badge--no { background: #fee2e2; border: 1px solid #fca5a5; color: #991b1b; }
  `],
})
export class TrialBalanceComponent {
  private readonly ledger = inject(LedgerApiService);

  protected readonly loading = signal(true);
  protected readonly tb = signal<TrialBalance | undefined>(undefined);

  protected readonly balanced = computed(() => {
    const t = this.tb();
    return !!t && Number(t.totalDebit) === Number(t.totalCredit);
  });

  constructor() {
    this.ledger.trialBalance().subscribe({
      next: (t) => { this.tb.set(t); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  protected money(v: string): string {
    const n = Number(v);
    return n === 0 ? '' : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

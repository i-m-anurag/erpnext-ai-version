import { Component, computed, inject, signal } from '@angular/core';
import { AccountApiService, type AccountNode } from '../../core/api/account.api.service';

/** A flattened tree row (node + its depth) for indented rendering. */
interface Row {
  node: AccountNode;
  depth: number;
}

/**
 * Chart of Accounts — read-only tree of the seeded single-company CoA, grouped
 * under the five root types with indented children. Balances arrive in a later
 * phase (once gl_entry + the balance query land).
 */
@Component({
  selector: 'erp-chart-of-accounts',
  imports: [],
  template: `
    <div class="mb-3">
      <div class="text-muted small">Accounting</div>
      <h4 class="mb-0">Chart of Accounts</h4>
    </div>

    <div class="erp-card p-0">
      <table class="coa">
        <thead>
          <tr><th>Account</th><th style="width:120px">Type</th><th style="width:90px" class="text-end">Root</th></tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.node.code) {
            <tr [class.coa__group]="r.node.isGroup">
              <td>
                <span [style.padding-left.px]="r.depth * 22">
                  @if (r.node.isGroup) { <i class="ph ph-folder-simple text-muted"></i> }
                  @else { <i class="ph ph-file-text text-muted"></i> }
                  {{ r.node.name }}
                </span>
              </td>
              <td>@if (r.node.accountType) { <span class="iq-chip">{{ r.node.accountType }}</span> }</td>
              <td class="text-end text-muted small">{{ r.node.rootType }}</td>
            </tr>
          } @empty {
            <tr><td colspan="3" class="text-muted text-center py-4">
              @if (loading()) { <i class="ph ph-circle-notch"></i> Loading… } @else { No accounts. }
            </td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .coa { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .coa th { text-align: left; padding: 10px 16px; font-size: 0.72rem; text-transform: uppercase;
      letter-spacing: 0.03em; color: var(--erp-text-muted); border-bottom: 1px solid var(--erp-border); }
    .coa td { padding: 8px 16px; border-bottom: 1px solid var(--erp-border); }
    .coa__group { font-weight: 600; background: var(--erp-surface-alt); }
    .iq-chip { display: inline-block; padding: 1px 8px; border-radius: 999px; background: var(--erp-surface-alt);
      border: 1px solid var(--erp-border); font-size: 0.75rem; }
  `],
})
export class ChartOfAccountsComponent {
  private readonly api = inject(AccountApiService);

  protected readonly loading = signal(true);
  protected readonly tree = signal<AccountNode[]>([]);

  /** Depth-first flatten so the tree renders as indented rows. */
  protected readonly rows = computed<Row[]>(() => {
    const out: Row[] = [];
    const walk = (nodes: AccountNode[], depth: number): void => {
      for (const node of nodes) {
        out.push({ node, depth });
        if (node.children.length) walk(node.children, depth + 1);
      }
    };
    walk(this.tree(), 0);
    return out;
  });

  constructor() {
    this.api.tree().subscribe({
      next: (t) => { this.tree.set(t); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { AssignmentApiService, type Assignment } from '../../core/api/assignment.api.service';
import { routeForMaster } from '../../core/config/view-configs';

/**
 * "My Work" — the current user's worklist of workflow assignments. Open tasks by
 * default; each row opens the underlying record. Reads /api/assignments/mine.
 */
@Component({
  selector: 'erp-my-work',
  imports: [DatePipe],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <div class="text-muted small">Workflow</div>
        <h4 class="mb-0">My Work</h4>
      </div>
      <div class="btn-group btn-group-sm" role="group">
        @for (f of filters; track f.value) {
          <button class="btn" [class.btn-primary]="status() === f.value" [class.btn-light]="status() !== f.value"
                  (click)="setStatus(f.value)">{{ f.label }}</button>
        }
      </div>
    </div>

    <div class="erp-card p-0">
      <table class="iq-table">
        <thead>
          <tr>
            <th>Record</th><th>Type</th><th>Role</th><th>Step</th><th>Assigned by</th><th>Assigned</th><th></th>
          </tr>
        </thead>
        <tbody>
          @for (a of assignments(); track a.id) {
            <tr class="iq-table__row" (click)="open(a)" [class.iq-table__row--muted]="a.status === 'closed'">
              <td class="iq-mono">{{ a.recordId }}</td>
              <td>{{ prettyType(a.entityType) }}</td>
              <td>{{ a.role ?? '—' }}</td>
              <td>@if (a.state) { <span class="iq-chip">{{ a.state }}</span> } @else { — }</td>
              <td class="text-muted">{{ a.assignedByName ?? 'System' }}</td>
              <td class="text-muted small">{{ a.createdAt | date: 'medium' }}</td>
              <td class="text-end">
                @if (routeFor(a)) { <i class="ph ph-arrow-right text-muted"></i> }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="text-muted text-center py-4">
              @if (loading()) { <i class="ph ph-circle-notch"></i> Loading… } @else { No {{ status() }} assignments. }
            </td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .iq-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .iq-table th { text-align: left; padding: 10px 14px; font-size: 0.72rem; text-transform: uppercase;
      letter-spacing: 0.03em; color: var(--erp-text-muted); border-bottom: 1px solid var(--erp-border); }
    .iq-table td { padding: 10px 14px; border-bottom: 1px solid var(--erp-border); }
    .iq-table__row { cursor: pointer; }
    .iq-table__row:hover { background: var(--erp-surface-alt); }
    .iq-table__row--muted td { opacity: 0.6; }
    .iq-chip { display: inline-block; padding: 1px 8px; border-radius: 999px; background: var(--erp-surface-alt);
      border: 1px solid var(--erp-border); font-size: 0.75rem; }
  `],
})
export class MyWorkComponent {
  private readonly api = inject(AssignmentApiService);
  private readonly router = inject(Router);

  protected readonly filters = [
    { label: 'Open', value: 'open' as const },
    { label: 'Closed', value: 'closed' as const },
    { label: 'All', value: 'all' as const },
  ];
  protected readonly status = signal<'open' | 'closed' | 'all'>('open');
  protected readonly loading = signal(false);
  protected readonly assignments = signal<Assignment[]>([]);

  constructor() {
    this.load();
  }

  protected setStatus(s: 'open' | 'closed' | 'all'): void {
    this.status.set(s);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.assignments.set([]);
    this.api.mine(this.status()).subscribe({
      next: (list) => {
        this.assignments.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected routeFor(a: Assignment): [string, string] | undefined {
    return routeForMaster(a.entityType);
  }

  protected open(a: Assignment): void {
    const route = this.routeFor(a);
    if (route) void this.router.navigate(['/app/m', route[0], route[1], a.recordId]);
  }

  protected prettyType(slug: string): string {
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

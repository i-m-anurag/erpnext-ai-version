import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { MasterRegistry } from '../../core/models/api.models';
import { MasterApiService } from '../../core/api/master.api.service';

/**
 * Registry of masters (Administration → Masters). Styled to the IQ design system:
 * toolbar header + search, dense table with status chips, row click → detail.
 */
@Component({
  selector: 'erp-masters-list',
  imports: [],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <div class="text-muted small">Administration</div>
        <h4 class="mb-0">Masters</h4>
      </div>
      <div class="d-flex gap-2 align-items-center">
        <div class="iq-search">
          <i class="ph ph-magnifying-glass"></i>
          <input placeholder="Search masters" [value]="query()" (input)="query.set($any($event.target).value)" />
        </div>
        <button class="btn btn-sm btn-ai"><i class="ph ph-sparkle"></i> Ask IQ</button>
      </div>
    </div>

    <div class="erp-card p-0">
      <table class="table table-hover mb-0 align-middle iq-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Managed</th>
            <th class="text-end">Rows</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (m of filtered(); track m.slug) {
            <tr style="cursor: pointer" (click)="open(m)">
              <td class="fw-medium">
                <i class="ph ph-database text-muted me-2"></i>{{ m.name }}
              </td>
              <td><span class="iq-mono text-muted">{{ m.slug }}</span></td>
              <td>
                <span class="iq-chip" [class]="m.managedBy === 'ui' ? 'iq-chip--ok' : 'iq-chip--warn'">
                  {{ m.managedBy === 'ui' ? 'Editable' : 'Seeded · read-only' }}
                </span>
              </td>
              <td class="text-end iq-mono text-muted">{{ m.rowCount ?? '—' }}</td>
              <td class="text-end">
                <button class="btn-icon" (click)="open(m); $event.stopPropagation()" aria-label="Open">
                  <i class="ph ph-arrow-right"></i>
                </button>
              </td>
            </tr>
          }
          @if (filtered().length === 0) {
            <tr><td colspan="5" class="text-muted text-center py-4">No masters found.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class MastersListComponent implements OnInit {
  private readonly api = inject(MasterApiService);
  private readonly router = inject(Router);

  readonly masters = signal<MasterRegistry[]>([]);
  readonly query = signal('');

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.masters();
    if (!q) return all;
    return all.filter((m) => m.name.toLowerCase().includes(q) || m.slug.toLowerCase().includes(q));
  });

  ngOnInit(): void {
    this.api.listMasters().subscribe((m) => this.masters.set(m));
  }

  protected open(m: MasterRegistry): void {
    void this.router.navigate(['/app/m/admin/masters', m.slug]);
  }
}

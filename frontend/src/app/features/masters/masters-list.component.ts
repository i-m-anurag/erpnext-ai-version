import { Component, inject, type OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MasterApiService } from '../../core/api/master.api.service';
import type { MasterRegistry } from '../../core/models/api.models';

@Component({
  selector: 'erp-masters-list',
  imports: [RouterLink],
  template: `
    <h4 class="mb-3">Masters</h4>
    <div class="erp-card p-0" style="max-width: 760px">
      <table class="table table-hover mb-0 align-middle">
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Managed</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (m of masters(); track m.slug) {
            <tr>
              <td class="fw-medium">{{ m.name }}</td>
              <td class="text-muted">{{ m.slug }}</td>
              <td>
                <span class="badge" [class.text-bg-secondary]="m.managedBy === 'seeded'" [class.text-bg-primary]="m.managedBy === 'ui'">
                  {{ m.managedBy === 'seeded' ? 'Seeded (read-only)' : 'Editable' }}
                </span>
              </td>
              <td class="text-end">
                <a class="btn btn-sm btn-outline-primary" [routerLink]="[m.slug]">Open</a>
              </td>
            </tr>
          }
          @if (masters().length === 0) {
            <tr><td colspan="4" class="text-muted text-center py-3">No masters.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class MastersListComponent implements OnInit {
  private readonly api = inject(MasterApiService);
  readonly masters = signal<MasterRegistry[]>([]);

  ngOnInit(): void {
    this.api.listMasters().subscribe((m) => this.masters.set(m));
  }
}

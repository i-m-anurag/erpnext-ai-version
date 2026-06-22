import { Component, inject, type OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NamingApiService, type NamingSeries } from '../../core/api/naming.api.service';

/** Administration → Numbering. Lists naming series (auto-id formats) per entity. */
@Component({
  selector: 'erp-numbering-list',
  imports: [],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <div class="text-muted small">Administration · Configuration</div>
        <h4 class="mb-0">Numbering</h4>
      </div>
    </div>

    <div class="erp-card p-0">
      <table class="table table-hover mb-0 align-middle iq-table">
        <thead>
          <tr><th>Entity</th><th>Pattern</th><th>Reset</th><th>Source</th><th></th></tr>
        </thead>
        <tbody>
          @for (s of series(); track s.slug) {
            <tr style="cursor: pointer" (click)="open(s)">
              <td class="fw-medium"><i class="ph ph-hash text-muted me-2"></i>{{ s.slug }}</td>
              <td><span class="iq-mono">{{ s.pattern }}</span></td>
              <td class="text-muted">{{ s.reset }}</td>
              <td>
                <span class="iq-chip" [class]="s.resolvedFrom === 'merged' ? 'iq-chip--ok' : 'iq-chip--warn'">
                  {{ s.resolvedFrom === 'merged' ? 'Customised' : 'Default' }}
                </span>
              </td>
              <td class="text-end"><button class="btn-icon"><i class="ph ph-arrow-right"></i></button></td>
            </tr>
          }
          @if (series().length === 0) {
            <tr><td colspan="5" class="text-muted text-center py-4">No naming series configured.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class NumberingListComponent implements OnInit {
  private readonly api = inject(NamingApiService);
  private readonly router = inject(Router);
  readonly series = signal<NamingSeries[]>([]);

  ngOnInit(): void {
    this.api.list().subscribe((s) => this.series.set(s));
  }
  protected open(s: NamingSeries): void {
    void this.router.navigate(['/app/m/admin/numbering', s.slug]);
  }
}

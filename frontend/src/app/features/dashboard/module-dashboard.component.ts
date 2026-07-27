import { Component, computed, effect, inject, input, signal } from '@angular/core';
import {
  DashboardApiService,
  type DashboardWidget,
  type SeriesData,
  type StatData,
  type TableData,
} from '../../core/api/dashboard.api.service';
import { badgeHtml, formatDateTime, lifecycleTone, stateTone } from '../../core/util/format';
import { ChartWidgetComponent } from './chart-widget.component';

/** Value formatting for a recent-table cell: ISO timestamps → DD-MM-YYYY HH:MM:SS. */
function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? formatDateTime(s) : s;
}

/**
 * Generic, config-driven module dashboard. Fetches the module's resolved widgets
 * (config + data) from /api/dashboards/:module and lays them on a 4-column grid by
 * each widget's `span`. Widget bodies switch on type — stat, chart, table — so a new
 * module gets a dashboard purely from its seeded JSON, no code here.
 */
@Component({
  selector: 'erp-module-dashboard',
  imports: [ChartWidgetComponent],
  template: `
    @if (loading()) {
      <div class="erp-card p-4 text-muted"><i class="ph ph-circle-notch"></i> Loading dashboard…</div>
    } @else if (widgets().length === 0) {
      <div class="erp-card p-4 text-muted">No dashboard configured for this module yet.</div>
    } @else {
      <div class="iq-dash">
        @for (w of widgets(); track $index) {
          <div class="iq-dash__widget" [style.grid-column]="'span ' + span(w)">
            @switch (w.type) {
              @case ('stat') {
                <div class="iq-stat">
                  <div class="iq-stat__label">{{ w.title }}</div>
                  <div class="iq-stat__value">{{ statValue(w) }}</div>
                  @if (statDelta(w); as d) {
                    <div class="iq-stat__delta" [class.up]="d.up" [class.down]="!d.up">
                      <i class="ph" [class.ph-trend-up]="d.up" [class.ph-trend-down]="!d.up"></i> {{ d.text }}
                    </div>
                  }
                </div>
              }
              @case ('chart') {
                <div class="erp-card p-3">
                  <div class="fw-semibold mb-2">{{ w.title }}</div>
                  @if (w.error) { <div class="text-muted small">{{ w.error }}</div> }
                  @else if (asSeries(w).points.length === 0) { <div class="text-muted small py-4 text-center">No data</div> }
                  @else { <erp-chart-widget [kind]="w.chart ?? 'bar'" [points]="asSeries(w).points" /> }
                </div>
              }
              @case ('table') {
                <div class="erp-card p-0">
                  <div class="p-3 fw-semibold border-bottom">{{ w.title }}</div>
                  @if (asTable(w).rows.length === 0) {
                    <div class="p-3 text-muted small">No recent records.</div>
                  } @else {
                    <table class="table mb-0 align-middle iq-table">
                      <thead>
                        <tr>
                          <th>Ref</th>
                          @for (c of asTable(w).columns; track c) { <th>{{ label(c) }}</th> }
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (r of asTable(w).rows; track $index) {
                          <tr>
                            <td class="iq-mono">{{ r['__code'] }}</td>
                            @for (c of asTable(w).columns; track c) { <td>{{ cell(r[c]) }}</td> }
                            <td [innerHTML]="statusBadge(r)"></td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                </div>
              }
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .iq-dash { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; align-items: start; }
    @media (max-width: 900px) { .iq-dash { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .iq-stat { background: var(--erp-surface); border: 1px solid var(--erp-border); border-radius: 12px; padding: 1rem 1.15rem; }
    .iq-stat__label { color: var(--erp-text-muted); font-size: 0.8rem; }
    .iq-stat__value { font-size: 1.7rem; font-weight: 600; line-height: 1.2; margin-top: 2px; }
    .iq-stat__delta { font-size: 0.78rem; margin-top: 4px; display: flex; align-items: center; gap: 4px; }
    .iq-stat__delta.up { color: var(--erp-success); }
    .iq-stat__delta.down { color: var(--erp-danger); }
    .iq-table th { font-size: 0.72rem; text-transform: uppercase; color: var(--erp-text-muted); font-weight: 600; }
  `],
})
export class ModuleDashboardComponent {
  readonly module = input.required<string>();
  private readonly api = inject(DashboardApiService);

  protected readonly widgets = signal<DashboardWidget[]>([]);
  protected readonly loading = signal(true);
  protected readonly cell = cell;

  constructor() {
    effect(() => {
      const mod = this.module();
      this.loading.set(true);
      this.api.forModule(mod).subscribe({
        next: (d) => { this.widgets.set(d.widgets); this.loading.set(false); },
        error: () => { this.widgets.set([]); this.loading.set(false); },
      });
    });
  }

  protected span(w: DashboardWidget): number { return Math.min(4, Math.max(1, w.span || 1)); }
  protected asSeries(w: DashboardWidget): SeriesData { return (w.data as SeriesData) ?? { points: [] }; }
  protected asTable(w: DashboardWidget): TableData { return (w.data as TableData) ?? { columns: [], rows: [] }; }

  protected statValue(w: DashboardWidget): string {
    return (w.data as StatData | null)?.value?.toLocaleString('en-IN') ?? '—';
  }
  protected statDelta(w: DashboardWidget): { up: boolean; text: string } | null {
    const d = (w.data as StatData | null)?.delta;
    if (d === undefined || d === null) return null;
    return { up: d >= 0, text: `${d >= 0 ? '+' : ''}${d}% vs prev 30d` };
  }

  /** 'purchaseOrder' → 'Purchase Order' for a table header. */
  protected label(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
  }
  protected statusBadge(r: Record<string, unknown>): string {
    const state = r['__rowState'];
    if (state) return badgeHtml(state, stateTone(state));
    return badgeHtml(r['__rowStatus'], lifecycleTone(r['__rowStatus']));
  }
}

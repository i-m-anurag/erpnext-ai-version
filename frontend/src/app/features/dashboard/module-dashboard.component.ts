import { Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  DashboardApiService,
  type DashboardWidget,
  type SeriesData,
  type StatData,
  type TableData,
} from '../../core/api/dashboard.api.service';
import { badgeHtml, formatDateTime, lifecycleTone, stateTone } from '../../core/util/format';
import { routeForMaster } from '../../core/config/view-configs';
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
                <div class="iq-stat" [class.iq-stat--link]="drill(w)" [attr.tabindex]="drill(w) ? 0 : null"
                     [attr.role]="drill(w) ? 'button' : null" (click)="open(w)" (keyup.enter)="open(w)">
                  <div class="iq-stat__top">
                    <span class="iq-stat__icon" [class]="'tone-' + (w.tone ?? 'accent')">
                      <i class="ph {{ w.icon ?? 'ph-chart-bar' }}"></i>
                    </span>
                    @if (statDelta(w); as d) {
                      <span class="iq-stat__delta" [class.up]="d.up" [class.down]="!d.up">
                        <i class="ph" [class.ph-trend-up]="d.up" [class.ph-trend-down]="!d.up"></i> {{ d.pct }}
                      </span>
                    }
                    @if (drill(w)) { <i class="ph ph-arrow-up-right iq-stat__go"></i> }
                  </div>
                  <div class="iq-stat__value">{{ statValue(w) }}</div>
                  <div class="iq-stat__label">{{ w.title }}</div>
                  @if (spark(w); as pts) {
                    <svg class="iq-stat__spark" [class]="'tone-' + (w.tone ?? 'accent')" viewBox="0 0 100 26" preserveAspectRatio="none">
                      <polyline [attr.points]="sparkLine(pts)" fill="none" stroke="currentColor" stroke-width="1.6" />
                    </svg>
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

    .iq-stat {
      position: relative; overflow: hidden;
      background: var(--erp-surface); border: 1px solid var(--erp-border); border-radius: 12px;
      padding: 0.9rem 1.05rem; transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
    }
    .iq-stat--link { cursor: pointer; }
    .iq-stat--link:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08); border-color: var(--erp-accent); }
    .iq-stat--link:hover .iq-stat__go { opacity: 1; }
    .iq-stat__top { display: flex; align-items: center; gap: 8px; }
    .iq-stat__icon { width: 34px; height: 34px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; font-size: 1.1rem; }
    .iq-stat__go { margin-left: auto; color: var(--erp-text-muted); opacity: 0; transition: opacity 0.12s ease; }
    .iq-stat__delta { margin-left: auto; font-size: 0.74rem; font-weight: 600; display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 999px; }
    .iq-stat__delta.up { color: #15803d; background: #dcfce7; }
    .iq-stat__delta.down { color: #b91c1c; background: #fee2e2; }
    .iq-stat__delta.up + .iq-stat__go, .iq-stat__delta.down + .iq-stat__go { margin-left: 6px; }
    .iq-stat__value { font-size: 1.8rem; font-weight: 600; line-height: 1.15; margin-top: 8px; }
    .iq-stat__label { color: var(--erp-text-muted); font-size: 0.82rem; }
    .iq-stat__spark { display: block; width: 100%; height: 26px; margin-top: 8px; }

    /* tone → icon chip fill + sparkline stroke */
    .iq-stat__icon.tone-accent  { background: var(--erp-accent-soft); color: var(--erp-accent); }
    .iq-stat__icon.tone-success { background: #dcfce7; color: #15803d; }
    .iq-stat__icon.tone-warning { background: #fef3c7; color: #b45309; }
    .iq-stat__icon.tone-danger  { background: #fee2e2; color: #b91c1c; }
    .iq-stat__icon.tone-info    { background: #e0f2fe; color: #0369a1; }
    .iq-stat__spark.tone-accent { color: var(--erp-accent); }
    .iq-stat__spark.tone-success { color: #22c55e; }
    .iq-stat__spark.tone-warning { color: #f59e0b; }
    .iq-stat__spark.tone-danger { color: #ef4444; }
    .iq-stat__spark.tone-info { color: #3b82f6; }

    .iq-table th { font-size: 0.72rem; text-transform: uppercase; color: var(--erp-text-muted); font-weight: 600; }
  `],
})
export class ModuleDashboardComponent {
  readonly module = input.required<string>();
  private readonly api = inject(DashboardApiService);
  private readonly router = inject(Router);

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
  protected statDelta(w: DashboardWidget): { up: boolean; pct: string } | null {
    const d = (w.data as StatData | null)?.delta;
    if (d === undefined || d === null) return null;
    return { up: d >= 0, pct: `${d >= 0 ? '+' : ''}${d}%` };
  }

  /** A stat's spark series, if it has one worth drawing (≥ 2 points, not all zero). */
  protected spark(w: DashboardWidget): number[] | null {
    const s = (w.data as StatData | null)?.spark;
    return s && s.length > 1 && s.some((n) => n > 0) ? s : null;
  }
  /** Spark values → a polyline in the 0..100 × 0..26 viewBox (baseline-padded). */
  protected sparkLine(pts: number[]): string {
    const max = Math.max(...pts, 1);
    const stepX = pts.length > 1 ? 100 / (pts.length - 1) : 0;
    return pts.map((v, i) => `${(i * stepX).toFixed(1)},${(24 - (v / max) * 22).toFixed(1)}`).join(' ');
  }

  /** The [module, sub] list this stat drills into (via its source master), or null. */
  protected drill(w: DashboardWidget): [string, string] | null {
    const master = w.type === 'stat' ? w.source?.master : undefined;
    return master ? (routeForMaster(master) ?? null) : null;
  }
  protected open(w: DashboardWidget): void {
    const route = this.drill(w);
    if (route) void this.router.navigate(['/app/m', route[0], route[1]]);
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

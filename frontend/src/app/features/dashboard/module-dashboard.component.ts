import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  DashboardApiService,
  type DashboardWidget,
  type SeriesData,
  type StatData,
  type TableData,
} from '../../core/api/dashboard.api.service';
import { badgeHtml, lifecycleTone, stateTone } from '../../core/util/format';
import { routeForMaster } from '../../core/config/view-configs';
import { ChartWidgetComponent } from './chart-widget.component';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const AMOUNT_KEYS = new Set(['amount', 'grandtotal', 'total', 'value', 'paidamount']);

/** The dashboard date-range presets. Each resolves to a "since" date (or none = all-time). */
type RangeKey = '7d' | '30d' | '90d' | 'qtd' | 'ytd' | 'all';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'qtd', label: 'QTD' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'All' },
];

/** Local Date → "YYYY-MM-DD" (no timezone shift). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Preset → the "since" date the API filters from; undefined for all-time. */
function sinceFor(key: RangeKey): string | undefined {
  const now = new Date();
  switch (key) {
    case '7d': return ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
    case '30d': return ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
    case '90d': return ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90));
    case 'qtd': return ymd(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1));
    case 'ytd': return ymd(new Date(now.getFullYear(), 0, 1));
    case 'all': return undefined;
  }
}

/** ISO date → "01 Aug 2026" (UTC, so a date-only value doesn't shift a timezone). */
function niceDate(v: unknown): string {
  const s = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Generic, config-driven module dashboard, laid out per design direction 1a:
 * a joined stat-card row (numbers + deltas + sparklines), a charts row, and a
 * recent-records table. Every module gets this from its seeded JSON — no code here.
 */
@Component({
  selector: 'erp-module-dashboard',
  imports: [ChartWidgetComponent],
  template: `
    @if (loading()) {
      <div class="erp-card p-4 text-muted"><i class="ph ph-circle-notch"></i> Loading dashboard…</div>
    } @else if (widgets().length === 0) {
      <div class="erp-card">
        <div class="iq-empty tall">
          <div class="iq-empty__icon"><i class="ph ph-squares-four"></i></div>
          <div class="iq-empty__title">No dashboard configured</div>
          <div class="iq-empty__sub">This module doesn’t have a dashboard layout yet.</div>
        </div>
      </div>
    } @else {
      <div class="iq-dash">

        <div class="iq-toolbar">
          <div class="iq-range" role="tablist" aria-label="Date range">
            @for (r of ranges; track r.key) {
              <button type="button" class="iq-range__btn" role="tab" [class.on]="range() === r.key"
                      [attr.aria-selected]="range() === r.key" (click)="range.set(r.key)">{{ r.label }}</button>
            }
          </div>
        </div>

        @if (stats().length) {
          <div class="iq-stats" [style.grid-template-columns]="'repeat(' + stats().length + ', minmax(0, 1fr))'">
            @for (w of stats(); track $index) {
              <div class="iq-stat" [class.link]="!!drill(w)" [attr.tabindex]="drill(w) ? 0 : null"
                   [attr.role]="drill(w) ? 'button' : null" (click)="open(w)" (keyup.enter)="open(w)">
                <div class="iq-stat__label">{{ w.title }}</div>
                <div class="iq-stat__row">
                  <div class="iq-stat__value">{{ statValue(w) }}</div>
                  @if (statDelta(w); as d) { <div class="iq-stat__delta" [class]="d.cls">{{ d.text }}</div> }
                  @if (drill(w)) { <i class="ph ph-arrow-up-right iq-stat__go"></i> }
                </div>
                @if (spark(w); as pts) {
                  <svg class="iq-stat__spark" [style.color]="toneColor(w)" viewBox="0 0 100 24" preserveAspectRatio="none">
                    <polyline [attr.points]="sparkLine(pts)" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke" />
                  </svg>
                }
              </div>
            }
          </div>
        }

        @if (charts().length) {
          <div class="iq-charts" [class.two]="charts().length === 2">
            @for (w of charts(); track $index) {
              <div class="erp-card iq-cc">
                <div class="iq-cc__title">{{ w.title }}</div>
                @if (w.error) {
                  <div class="iq-empty error">
                    <div class="iq-empty__icon"><i class="ph ph-warning-circle"></i></div>
                    <div class="iq-empty__title">Couldn’t load this widget</div>
                    <div class="iq-empty__sub">{{ w.error }}</div>
                  </div>
                } @else if (asSeries(w).points.length === 0) {
                  <div class="iq-empty">
                    <div class="iq-empty__icon"><i class="ph {{ chartIcon(w) }}"></i></div>
                    <div class="iq-empty__title">Nothing to chart</div>
                    <div class="iq-empty__sub">{{ rangeHint() }}</div>
                  </div>
                } @else { <erp-chart-widget [kind]="w.chart ?? 'bar'" [points]="asSeries(w).points" /> }
              </div>
            }
          </div>
        }

        @for (w of tables(); track $index) {
          <div class="erp-card iq-tc">
            <div class="iq-tc__head">
              <span class="iq-tc__title">{{ w.title }}</span>
              @if (drill(w)) { <a class="iq-tc__all" (click)="open(w)">View all →</a> }
            </div>
            @if (asTable(w).rows.length === 0) {
              <div class="iq-empty pad">
                <div class="iq-empty__icon"><i class="ph ph-tray"></i></div>
                <div class="iq-empty__title">No records yet</div>
                <div class="iq-empty__sub">{{ rangeHint() }}</div>
              </div>
            } @else {
              <table class="iq-tbl">
                <thead>
                  <tr>
                    <th>Ref</th>
                    @for (c of asTable(w).columns; track c) { <th [class.num]="isAmount(c)">{{ label(c) }}</th> }
                    <th class="num">Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of asTable(w).rows; track $index) {
                    <tr>
                      <td class="ref">{{ r['__code'] }}</td>
                      @for (c of asTable(w).columns; track c) { <td [class.num]="isAmount(c)">{{ cell(c, r[c]) }}</td> }
                      <td class="num" [innerHTML]="statusBadge(r)"></td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .iq-dash { display: flex; flex-direction: column; gap: 18px; }

    /* Date-range segmented control */
    .iq-toolbar { display: flex; justify-content: flex-end; }
    .iq-range { display: inline-flex; background: var(--erp-surface, #fff); border: 1px solid #e5e5ea; border-radius: 9px; padding: 3px; gap: 2px; }
    .iq-range__btn { border: 0; background: transparent; cursor: pointer; padding: 5px 12px; border-radius: 6px; font: 600 12px system-ui, sans-serif; color: #6b6b76; transition: background 0.12s ease, color 0.12s ease; }
    .iq-range__btn:hover { color: #17171a; }
    .iq-range__btn.on { background: #eef0ff; color: #4f46e5; }

    /* Joined stat row — one card, cells divided by borders */
    .iq-stats { display: grid; background: var(--erp-surface); border: 1px solid #e9e9ec; border-radius: 10px; }
    @media (max-width: 820px) { .iq-stats { grid-template-columns: repeat(2, 1fr) !important; } }
    .iq-stat { padding: 16px 20px; display: flex; flex-direction: column; gap: 6px; border-left: 1px solid #eeeef1; transition: background 0.12s ease; }
    .iq-stat:first-child { border-left: 0; }
    .iq-stat.link { cursor: pointer; }
    .iq-stat.link:hover { background: #fafafb; }
    .iq-stat.link:hover .iq-stat__go { opacity: 1; }
    .iq-stat__label { font: 600 10.5px system-ui, sans-serif; letter-spacing: 0.07em; color: #8b8b96; text-transform: uppercase; }
    .iq-stat__row { display: flex; align-items: baseline; gap: 8px; }
    .iq-stat__value { font: 600 28px/1 system-ui, sans-serif; color: #17171a; }
    .iq-stat__delta { font: 500 12px system-ui, sans-serif; }
    .iq-stat__delta.up { color: #16a34a; } .iq-stat__delta.down { color: #dc2626; } .iq-stat__delta.flat { color: #8b8b96; }
    .iq-stat__go { margin-left: auto; color: #a1a1ad; opacity: 0; transition: opacity 0.12s ease; align-self: center; }
    .iq-stat__spark { display: block; width: 100%; height: 22px; margin-top: 2px; }

    /* Charts row */
    .iq-charts { display: grid; grid-template-columns: 1fr; gap: 18px; }
    .iq-charts.two { grid-template-columns: 1.35fr 1fr; }
    @media (max-width: 900px) { .iq-charts.two { grid-template-columns: 1fr; } }
    .iq-cc { padding: 18px 22px 20px; }
    .iq-cc__title { font: 600 14px system-ui, sans-serif; color: #17171a; }
    .iq-cc erp-chart-widget { display: block; margin-top: 16px; }

    /* Recent table */
    .iq-tc { padding: 0; overflow: hidden; }
    .iq-tc__head { padding: 16px 22px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eeeef1; }
    .iq-tc__title { font: 600 14px system-ui, sans-serif; color: #17171a; }
    .iq-tc__all { font: 500 12px system-ui, sans-serif; color: #4f46e5; cursor: pointer; text-decoration: none; }
    .iq-tbl { width: 100%; border-collapse: collapse; }
    .iq-tbl th { padding: 9px 22px; background: #fafafb; border-bottom: 1px solid #eeeef1; font: 600 10.5px system-ui, sans-serif; letter-spacing: 0.07em; color: #8b8b96; text-transform: uppercase; text-align: left; }
    .iq-tbl td { padding: 12px 22px; border-bottom: 1px solid #f4f4f6; font: 13px system-ui, sans-serif; color: #3f3f46; }
    .iq-tbl tbody tr:last-child td { border-bottom: 0; }
    .iq-tbl .num { text-align: right; }
    .iq-tbl td.ref { font-family: var(--erp-font-mono, ui-monospace); color: #4f46e5; }

    /* Empty / error states — icon in a soft disc, title, muted hint */
    .iq-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 5px; min-height: 150px; padding: 20px; }
    .iq-empty.pad { min-height: 128px; }
    .iq-empty.tall { min-height: 220px; }
    .iq-empty__icon { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: #f2f2f6; color: #a6a6b2; font-size: 22px; margin-bottom: 3px; }
    .iq-empty__title { font: 600 13.5px system-ui, sans-serif; color: #45454d; }
    .iq-empty__sub { font: 12.5px system-ui, sans-serif; color: #9a9aa4; max-width: 30ch; }
    .iq-empty.error .iq-empty__icon { background: #fef2f2; color: #ef4444; }
    .iq-empty.error .iq-empty__title { color: #b91c1c; }
    .iq-empty.error .iq-empty__sub { color: #c05a5a; }
  `],
})
export class ModuleDashboardComponent {
  readonly module = input.required<string>();
  private readonly api = inject(DashboardApiService);
  private readonly router = inject(Router);

  protected readonly ranges = RANGES;
  protected readonly range = signal<RangeKey>('30d');

  protected readonly widgets = signal<DashboardWidget[]>([]);
  protected readonly loading = signal(true);

  protected readonly stats = computed(() => this.widgets().filter((w) => w.type === 'stat'));
  protected readonly charts = computed(() => this.widgets().filter((w) => w.type === 'chart'));
  protected readonly tables = computed(() => this.widgets().filter((w) => w.type === 'table'));

  constructor() {
    effect(() => {
      const mod = this.module();
      const from = sinceFor(this.range());
      this.loading.set(true);
      this.api.forModule(mod, from).subscribe({
        next: (d) => { this.widgets.set(d.widgets); this.loading.set(false); },
        error: () => { this.widgets.set([]); this.loading.set(false); },
      });
    });
  }

  /** Empty-state icon that echoes the chart type. */
  protected chartIcon(w: DashboardWidget): string {
    return { bar: 'ph-chart-bar', line: 'ph-chart-line-up', pie: 'ph-chart-pie-slice' }[w.chart ?? 'bar'];
  }
  /** Context hint for empty charts/tables: nudge toward a wider range when one is active. */
  protected rangeHint(): string {
    return this.range() === 'all'
      ? 'Records will appear here once there’s activity.'
      : 'No activity in the selected range — try “All”.';
  }

  protected asSeries(w: DashboardWidget): SeriesData { return (w.data as SeriesData) ?? { points: [] }; }
  protected asTable(w: DashboardWidget): TableData { return (w.data as TableData) ?? { columns: [], rows: [] }; }

  protected statValue(w: DashboardWidget): string {
    return (w.data as StatData | null)?.value?.toLocaleString('en-IN') ?? '—';
  }
  protected statDelta(w: DashboardWidget): { cls: string; text: string } | null {
    const d = (w.data as StatData | null)?.delta;
    if (d === undefined || d === null) return null;
    if (d === 0) return { cls: 'flat', text: 'flat' };
    return d > 0 ? { cls: 'up', text: `+${d}%` } : { cls: 'down', text: `−${Math.abs(d)}%` };
  }
  protected spark(w: DashboardWidget): number[] | null {
    const s = (w.data as StatData | null)?.spark;
    return s && s.length > 1 && s.some((n) => n > 0) ? s : null;
  }
  protected sparkLine(pts: number[]): string {
    const max = Math.max(...pts, 1);
    const stepX = pts.length > 1 ? 100 / (pts.length - 1) : 0;
    return pts.map((v, i) => `${(i * stepX).toFixed(1)},${(22 - (v / max) * 20).toFixed(1)}`).join(' ');
  }
  protected toneColor(w: DashboardWidget): string {
    return { accent: '#4f46e5', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444', info: '#3b82f6' }[w.tone ?? 'accent'];
  }

  protected isAmount(key: string): boolean { return AMOUNT_KEYS.has(key.toLowerCase()); }
  protected cell(key: string, v: unknown): string {
    if (this.isAmount(key)) { const n = Number(v); return n ? '₹ ' + n.toLocaleString('en-IN') : ''; }
    return niceDate(v);
  }
  protected label(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
  }
  protected statusBadge(r: Record<string, unknown>): string {
    const state = r['__rowState'];
    return state ? badgeHtml(state, stateTone(state)) : badgeHtml(r['__rowStatus'], lifecycleTone(r['__rowStatus']));
  }

  protected drill(w: DashboardWidget): [string, string] | null {
    const master = w.source?.master;
    return master ? (routeForMaster(master) ?? null) : null;
  }
  protected open(w: DashboardWidget): void {
    const route = this.drill(w);
    if (route) void this.router.navigate(['/app/m', route[0], route[1]]);
  }
}

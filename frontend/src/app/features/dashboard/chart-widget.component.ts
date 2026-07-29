import { Component, computed, input } from '@angular/core';
import type { SeriesPoint } from '../../core/api/dashboard.api.service';

/** Indigo ramp for bars (darkest = largest); categorical palette for donut slices. */
const BAR_RAMP = ['#4f46e5', '#6d66ea', '#8b85ef', '#a8a3f3', '#c4c1f7', '#d6d4f9', '#e4e2fc', '#eeedfe'];
const PIE_PALETTE = ['#4f46e5', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#3b82f6', '#a855f7', '#ef4444'];

const inr = (n: number): string => '₹' + n.toLocaleString('en-IN');

/**
 * Dashboard chart, hand-rendered in HTML/SVG (no charting lib) to match the design:
 *  - bar  → a horizontal labelled bar list (label · track+fill · value)
 *  - pie  → a conic-gradient donut with a value/percent legend
 *  - line → a filled SVG area with markers
 */
@Component({
  selector: 'erp-chart-widget',
  template: `
    @switch (kind()) {
      @case ('bar') {
        <div class="cw-bars">
          @for (r of bars(); track r.label) {
            <div class="cw-bar">
              <div class="cw-bar__label" [title]="r.label">{{ r.label }}</div>
              <div class="cw-bar__track"><div class="cw-bar__fill" [style.width.%]="r.pct" [style.background]="r.color"></div></div>
              <div class="cw-bar__val">{{ r.value }}</div>
            </div>
          }
        </div>
      }
      @case ('pie') {
        <div class="cw-pie">
          <div class="cw-donut" [style.background]="donutGradient()">
            <div class="cw-donut__hole">
              <div class="cw-donut__total">{{ total() }}</div>
              <div class="cw-donut__cap">total</div>
            </div>
          </div>
          <div class="cw-legend">
            @for (s of slices(); track s.label) {
              <div class="cw-leg">
                <span class="cw-leg__dot" [style.background]="s.color"></span>
                <span class="cw-leg__label" [title]="s.label">{{ s.label }}</span>
                <span class="cw-leg__val">{{ s.value }}</span>
                <span class="cw-leg__pct">{{ s.pct }}%</span>
              </div>
            }
          </div>
        </div>
      }
      @case ('line') {
        <svg class="cw-line" viewBox="0 0 300 120" preserveAspectRatio="none">
          <polygon [attr.points]="areaPoints()" fill="rgba(79,70,229,0.10)" />
          <polyline [attr.points]="linePoints()" fill="none" stroke="#4f46e5" stroke-width="2" vector-effect="non-scaling-stroke" />
        </svg>
      }
    }
  `,
  styles: [`
    :host { display: block; }
    .cw-bars { display: flex; flex-direction: column; gap: 11px; }
    .cw-bar { display: grid; grid-template-columns: 130px 1fr 38px; align-items: center; gap: 12px; }
    .cw-bar__label { font-size: 13px; color: #3f3f46; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cw-bar__track { height: 22px; background: #f3f3f5; border-radius: 4px; overflow: hidden; }
    .cw-bar__fill { height: 100%; border-radius: 4px; min-width: 3px; transition: width 0.3s ease; }
    .cw-bar__val { font-weight: 600; font-size: 13px; color: #17171a; text-align: right; }

    .cw-pie { display: flex; align-items: center; gap: 22px; }
    .cw-donut { position: relative; width: 132px; height: 132px; flex: none; border-radius: 50%; }
    .cw-donut__hole { position: absolute; inset: 26px; background: var(--erp-surface, #fff); border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .cw-donut__total { font-weight: 600; font-size: 20px; line-height: 1; color: #17171a; }
    .cw-donut__cap { font-size: 11px; color: #8b8b96; }
    .cw-legend { display: flex; flex-direction: column; gap: 12px; flex: 1; min-width: 0; }
    .cw-leg { display: flex; align-items: center; gap: 9px; }
    .cw-leg__dot { width: 9px; height: 9px; border-radius: 2px; flex: none; }
    .cw-leg__label { font-size: 13px; color: #3f3f46; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cw-leg__val { font-weight: 600; font-size: 13px; color: #17171a; }
    .cw-leg__pct { font-size: 12px; color: #8b8b96; width: 36px; text-align: right; }

    .cw-line { display: block; width: 100%; height: 150px; }
  `],
})
export class ChartWidgetComponent {
  readonly kind = input.required<'bar' | 'line' | 'pie'>();
  readonly points = input.required<SeriesPoint[]>();

  protected readonly total = computed(() => this.points().reduce((s, p) => s + p.value, 0));

  protected readonly bars = computed(() => {
    const pts = this.points();
    const max = Math.max(...pts.map((p) => p.value), 1);
    return pts.map((p, i) => ({ label: p.label, value: p.value, pct: (p.value / max) * 100, color: BAR_RAMP[i % BAR_RAMP.length] }));
  });

  protected readonly slices = computed(() => {
    const t = this.total() || 1;
    return this.points().map((p, i) => ({
      label: p.label,
      value: p.value,
      pct: Math.round((p.value / t) * 100),
      color: PIE_PALETTE[i % PIE_PALETTE.length],
    }));
  });

  protected donutGradient(): string {
    const t = this.total() || 1;
    let acc = 0;
    const stops = this.slices().map((s) => {
      const from = (acc / t) * 100;
      acc += s.value;
      const to = (acc / t) * 100;
      return `${s.color} ${from}% ${to}%`;
    });
    return `conic-gradient(${stops.join(',')})`;
  }

  /** Line: map points into the 300×120 viewBox (baseline padded), newest at right. */
  private coords(): { x: number; y: number }[] {
    const pts = this.points();
    if (pts.length === 0) return [];
    const max = Math.max(...pts.map((p) => p.value), 1);
    const stepX = pts.length > 1 ? 300 / (pts.length - 1) : 0;
    return pts.map((p, i) => ({ x: i * stepX, y: 112 - (p.value / max) * 100 }));
  }
  protected linePoints(): string {
    return this.coords().map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  }
  protected areaPoints(): string {
    const c = this.coords();
    if (c.length === 0) return '';
    return `0,120 ${this.linePoints()} ${c[c.length - 1]!.x.toFixed(1)},120`;
  }

  protected readonly _inr = inr; // reserved for value labels if needed
}

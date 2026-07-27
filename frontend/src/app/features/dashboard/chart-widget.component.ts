import { Component, ElementRef, effect, input, viewChild, type OnDestroy } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import type { SeriesPoint } from '../../core/api/dashboard.api.service';

Chart.register(...registerables);

/** Categorical palette (indigo-led), reused across bar/pie slices. */
const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#3b82f6', '#a855f7', '#ef4444'];

/** A single Chart.js chart (bar / line / pie) driven by a metric series. */
@Component({
  selector: 'erp-chart-widget',
  template: `<div style="position:relative; height:220px"><canvas #cv></canvas></div>`,
})
export class ChartWidgetComponent implements OnDestroy {
  readonly kind = input.required<'bar' | 'line' | 'pie'>();
  readonly points = input.required<SeriesPoint[]>();
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private chart?: Chart;

  constructor() {
    // Re-render whenever the canvas becomes available or the data/kind changes.
    effect(() => {
      const el = this.canvasRef().nativeElement;
      const kind = this.kind();
      const pts = this.points();
      this.chart?.destroy();
      this.chart = new Chart(el, {
        type: kind === 'pie' ? 'pie' : kind,
        data: {
          labels: pts.map((p) => p.label),
          datasets: [
            {
              label: '',
              data: pts.map((p) => p.value),
              backgroundColor: kind === 'line' ? 'rgba(99,102,241,0.15)' : PALETTE,
              borderColor: kind === 'line' ? '#6366f1' : PALETTE,
              borderWidth: kind === 'line' ? 2 : 0,
              fill: kind === 'line',
              tension: 0.3,
              borderRadius: kind === 'bar' ? 4 : 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: kind === 'pie', position: 'right' } },
          scales: kind === 'pie' ? {} : { y: { beginAtZero: true, ticks: { precision: 0 } } },
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}

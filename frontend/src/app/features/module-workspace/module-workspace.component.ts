import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { findModule, type SubModule } from '../../core/config/modules.config';
import { hasView } from '../../core/config/view-configs';
import { ListViewComponent } from '../views/list-view.component';

interface Kpi {
  label: string;
  value: string;
  delta: string;
  up: boolean;
}

/**
 * Module content area. The sub-module navigation lives in the shell sidebar now;
 * this component just renders the content for the active sub-module (full width).
 * Mock data; sub-modules will route to config-driven List/Record next.
 */
@Component({
  selector: 'erp-module-workspace',
  imports: [RouterLink, ListViewComponent],
  template: `
    @if (module(); as mod) {
      @if (showList()) {
        <div class="iq-mod__content"><erp-list-view [module]="slug()" [sub]="sub()" /></div>
      } @else {
      <div class="iq-mod__content">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <div>
            <div class="text-muted small">{{ mod.name }} / {{ activeName() }}</div>
            <h4 class="mb-0">{{ activeName() }}</h4>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-ai"><i class="ph ph-sparkle"></i> Ask IQ</button>
            <button class="btn btn-sm btn-primary"><i class="ph ph-plus"></i> New</button>
          </div>
        </div>

        @if (sub() === 'dashboard') {
          <div class="iq-kpis">
            @for (k of kpis; track k.label) {
              <div class="iq-kpi">
                <div class="iq-kpi__label">{{ k.label }}</div>
                <div class="iq-kpi__value">{{ k.value }}</div>
                <div class="iq-kpi__delta" [class.up]="k.up" [class.down]="!k.up">
                  <i class="ph" [class.ph-trend-up]="k.up" [class.ph-trend-down]="!k.up"></i> {{ k.delta }}
                </div>
              </div>
            }
          </div>

          <div class="iq-mod__grid">
            <div class="erp-card p-3">
              <div class="fw-semibold mb-2">Activity trend</div>
              <div class="iq-chart-placeholder">Chart placeholder</div>
            </div>
            <div class="erp-card p-3 iq-ai-panel">
              <div class="iq-ai-panel__head"><i class="ph ph-sparkle"></i> AI Insights</div>
              @for (ins of insights; track ins) {
                <div class="iq-ai-panel__item"><i class="ph ph-lightbulb"></i><span>{{ ins }}</span></div>
              }
            </div>
          </div>

          <div class="erp-card p-0 mt-3">
            <div class="p-3 fw-semibold border-bottom">Recent activity</div>
            <table class="table table-hover mb-0 align-middle iq-table">
              <thead>
                <tr><th>Date</th><th>Reference</th><th>Description</th><th>Status</th></tr>
              </thead>
              <tbody>
                @for (r of rows; track r.ref) {
                  <tr>
                    <td class="iq-mono">{{ r.date }}</td>
                    <td class="iq-mono">{{ r.ref }}</td>
                    <td>{{ r.desc }}</td>
                    <td><span class="iq-chip" [class]="r.statusClass">{{ r.status }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="erp-card p-4 text-muted">
            <i class="ph ph-stack" style="font-size:1.4rem"></i>
            <div class="mt-2">"{{ activeName() }}" — list &amp; record views are config-driven and arrive in the next step.</div>
          </div>
        }
      </div>
      }
    } @else {
      <div class="erp-card p-4">Unknown module. <a routerLink="/app/dashboard">Back to workspace</a>.</div>
    }
  `,
})
export class ModuleWorkspaceComponent {
  readonly slug = input.required<string>();
  readonly sub = input<string>('dashboard');

  protected readonly module = computed(() => findModule(this.slug()));
  /** a config-driven List exists for this sub-module → render table instead of dashboard */
  protected readonly showList = computed(() => hasView(this.slug(), this.sub()));
  protected readonly activeName = computed<string>(() => {
    const s = this.module()?.subModules.find((x: SubModule) => x.slug === this.sub());
    return s?.name ?? 'Dashboard';
  });

  protected readonly kpis: Kpi[] = [
    { label: 'Records', value: '1,240', delta: '+3.2%', up: true },
    { label: 'Open items', value: '86', delta: '+12', up: true },
    { label: 'Pending approval', value: '7', delta: '-2', up: false },
    { label: 'This month', value: '₹4.2L', delta: '+8%', up: true },
  ];
  protected readonly insights = [
    'Reorder 5 SKUs predicted to stock out in 14 days',
    'Slow-moving stock detected in Warehouse B',
    '3 transfers pending over SLA',
  ];
  protected readonly rows = [
    { date: '2026-06-07', ref: 'PO-2026-0042', desc: 'Purchase order created', status: 'Pending', statusClass: 'iq-chip--warn' },
    { date: '2026-06-06', ref: 'GRN-0188', desc: 'Goods received', status: 'Completed', statusClass: 'iq-chip--ok' },
    { date: '2026-06-06', ref: 'TRF-0091', desc: 'Inter-branch transfer', status: 'In transit', statusClass: 'iq-chip--info' },
    { date: '2026-06-05', ref: 'ADJ-0023', desc: 'Stock adjustment', status: 'Posted', statusClass: 'iq-chip--ok' },
  ];
}

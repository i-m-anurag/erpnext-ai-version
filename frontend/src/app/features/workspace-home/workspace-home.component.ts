import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/state/auth.store';
import { MODULES } from '../../core/config/modules.config';

interface AiInsight {
  icon: string;
  title: string;
  detail: string;
  action: string;
}

@Component({
  selector: 'erp-workspace-home',
  imports: [RouterLink],
  template: `
    <div class="iq-home">
      <header class="iq-home__greeting">
        <h2 class="mb-1">Good {{ partOfDay() }}, {{ firstName() }}</h2>
        <div class="text-muted">{{ today }}</div>
      </header>

      <!-- AI insights -->
      <div class="iq-ai-strip">
        <div class="iq-ai-strip__label"><i class="ph ph-sparkle"></i> AI INSIGHTS & AUTOMATIONS</div>
        <div class="iq-ai-cards">
          @for (ins of insights; track ins.title) {
            <div class="iq-ai-card">
              <div class="iq-ai-card__icon"><i class="ph {{ ins.icon }}"></i></div>
              <div class="iq-ai-card__body">
                <div class="iq-ai-card__title">{{ ins.title }}</div>
                <div class="iq-ai-card__detail">{{ ins.detail }}</div>
                <a class="iq-ai-card__action" href="javascript:void(0)">{{ ins.action }} →</a>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Module grid -->
      <div class="iq-section-head">
        <h5 class="mb-0">Workspace Modules</h5>
        <span class="text-muted small">Pick a module to get started</span>
      </div>
      <div class="iq-module-grid">
        @for (m of modules; track m.slug) {
          <a class="iq-module-tile" [routerLink]="['/app/m', m.slug]">
            <div class="iq-module-tile__top">
              <span class="iq-module-tile__icon"><i class="ph {{ m.icon }}"></i></span>
              <i class="ph ph-sparkle iq-module-tile__ai" title="AI-assisted"></i>
            </div>
            <div class="iq-module-tile__name">{{ m.name }}</div>
            <div class="iq-module-tile__desc">{{ m.description }}</div>
            <div class="iq-module-tile__kpi">{{ m.kpi }}</div>
          </a>
        }
      </div>
    </div>
  `,
})
export class WorkspaceHomeComponent {
  private readonly store = inject(AuthStore);
  protected readonly modules = MODULES;

  protected readonly today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  protected readonly insights: AiInsight[] = [
    { icon: 'ph-trend-up', title: 'Cash flow up 8% this month', detail: 'Driven by faster receivables clearing.', action: 'View report' },
    { icon: 'ph-stamp', title: '3 Purchase Orders need approval', detail: 'Pending your sign-off for Q3 runs.', action: 'Review' },
    { icon: 'ph-package', title: 'Reorder suggested for 5 SKUs', detail: 'Predicted stockout within 14 days.', action: 'Plan reorder' },
  ];

  protected firstName(): string {
    const u = this.store.user();
    return (u?.displayName || u?.username || 'there').split(' ')[0]!;
  }

  protected partOfDay(): string {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  }
}

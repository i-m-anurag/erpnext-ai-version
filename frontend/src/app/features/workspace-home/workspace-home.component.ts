import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/state/auth.store';
import { MODULES } from '../../core/config/modules.config';

@Component({
  selector: 'erp-workspace-home',
  imports: [RouterLink],
  template: `
    <div class="iq-home">
      <header class="iq-home__greeting">
        <h2 class="mb-1">Good {{ partOfDay() }}, {{ firstName() }}</h2>
        <div class="text-muted">{{ today }}</div>
      </header>

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

  protected firstName(): string {
    const u = this.store.user();
    return (u?.displayName || u?.username || 'there').split(' ')[0]!;
  }

  protected partOfDay(): string {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  }
}

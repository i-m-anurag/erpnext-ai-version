import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { findModule, type SubModule } from '../../core/config/modules.config';
import { hasView } from '../../core/config/view-configs';
import { ListViewComponent } from '../views/list-view.component';
import { ModuleDashboardComponent } from '../dashboard/module-dashboard.component';

/**
 * Module content area. The sub-module navigation lives in the shell sidebar now;
 * this component renders the content for the active sub-module: the config-driven
 * dashboard, a config-driven List, or a placeholder for sub-modules not yet built.
 */
@Component({
  selector: 'erp-module-workspace',
  imports: [RouterLink, ListViewComponent, ModuleDashboardComponent],
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
          <erp-module-dashboard [module]="slug()" />
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

}

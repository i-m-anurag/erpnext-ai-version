import { Component, inject } from '@angular/core';
import { AuthStore } from '../../core/state/auth.store';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';

@Component({
  selector: 'erp-dashboard',
  imports: [HasPermissionDirective],
  template: `
    <h4 class="mb-1">Welcome, {{ store.user()?.displayName || store.user()?.username }}</h4>
    <p class="text-muted">You're signed in. This is the dashboard.</p>

    <div class="erp-card p-3 mb-3" style="max-width: 640px">
      <div class="fw-semibold mb-2">Session</div>
      <div class="small text-muted">Permissions granted: {{ store.permissions().length }}</div>
      <div class="small text-muted">Enabled modules: {{ enabledModules() }}</div>

      <!-- ACL directive demo: only visible with master:create -->
      <button *hasPermission="'master:create'" class="btn btn-sm btn-primary mt-3">
        + New master (visible only with master:create)
      </button>
    </div>
  `,
})
export class DashboardComponent {
  protected readonly store = inject(AuthStore);

  protected enabledModules(): string {
    return Object.entries(this.store.modules())
      .filter(([, on]) => on)
      .map(([name]) => name)
      .join(', ');
  }
}

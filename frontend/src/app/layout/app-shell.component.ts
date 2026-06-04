import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { AuthStore } from '../core/state/auth.store';
import { NAV_ITEMS } from './nav';

/**
 * Authenticated shell: sidebar (nav filtered by enabled modules + permissions) +
 * topbar (logged-in user + logout) + a router-outlet whose content changes per route.
 */
@Component({
  selector: 'erp-app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="erp-shell">
      <aside class="erp-sidebar">
        <div class="erp-sidebar__brand">ERP</div>
        <nav class="erp-sidebar__nav">
          @for (item of visibleNav(); track item.route) {
            <a class="erp-sidebar__link" [routerLink]="item.route" routerLinkActive="active">
              {{ item.label }}
            </a>
          }
        </nav>
      </aside>

      <header class="erp-topbar">
        <div class="fw-semibold">{{ store.user()?.displayName || store.user()?.username }}</div>
        <div class="d-flex align-items-center gap-3">
          <span class="text-muted small">{{ store.user()?.email }}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" (click)="logout()">Logout</button>
        </div>
      </header>

      <main class="erp-main">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AppShellComponent {
  protected readonly store = inject(AuthStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly visibleNav = computed(() =>
    NAV_ITEMS.filter(
      (i) =>
        (!i.module || this.store.isModuleEnabled(i.module)) &&
        (!i.permission || this.store.hasPermission(i.permission)),
    ),
  );

  protected logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}

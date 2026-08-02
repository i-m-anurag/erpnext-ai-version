import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { AuthStore } from '../core/state/auth.store';
import { BrandingService } from '../core/branding/branding.service';
import { IntegrationSettingsService } from '../core/integration/integration-settings.service';
import { findModule, MODULES, type ErpModule, type SubModule } from '../core/config/modules.config';

/**
 * Authenticated shell with ONE context-aware sidebar:
 *  - on Home (/app/dashboard): the sidebar lists all modules (the main area shows
 *    the module launcher grid);
 *  - inside a module (/app/m/:slug/...): the SAME sidebar switches to that
 *    module's sub-modules (+ "All Modules" back link), so the content gets the
 *    full width — no second sidebar.
 */
@Component({
  selector: 'erp-app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="erp-shell" [class.is-collapsed]="collapsed()">
      <aside class="erp-sidebar">
        <div class="erp-sidebar__brand">
          <img [src]="branding.logoUrl()" [alt]="branding.productName()" height="26" />
          <span>{{ branding.productName() }}</span>
          <button
            type="button" class="erp-sidebar__toggle" (click)="toggleCollapse()"
            [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          >
            <i class="ph" [class.ph-sidebar-simple]="!collapsed()" [class.ph-sidebar]="collapsed()"></i>
          </button>
        </div>

        <nav class="erp-sidebar__nav">
          @if (activeModule(); as mod) {
            <!-- inside a module: sub-module nav -->
            <a class="erp-sidebar__back" routerLink="/app/dashboard">
              <i class="ph ph-caret-left"></i><span>All Modules</span>
            </a>
            <div class="erp-sidebar__module">
              <span class="erp-sidebar__module-icon"><i class="ph {{ mod.icon }}"></i></span>
              <span>{{ mod.name }}</span>
            </div>
            @for (s of subModulesFor(mod); track s.slug) {
              <a class="erp-sidebar__link" [routerLink]="['/app/m', mod.slug, s.slug]" routerLinkActive="active">
                <i class="ph {{ s.icon }} erp-sidebar__icon"></i><span>{{ s.name }}</span>
              </a>
            }
            <div class="erp-sidebar__ai"><i class="ph ph-sparkle"></i><span>Ask IQ about {{ mod.name }}</span></div>
          } @else {
            <!-- home: module list -->
            <a class="erp-sidebar__link" routerLink="/app/dashboard" routerLinkActive="active"
               [routerLinkActiveOptions]="{ exact: true }">
              <i class="ph ph-house erp-sidebar__icon"></i><span>Home</span>
            </a>
            <div class="erp-sidebar__group">Modules</div>
            @for (m of modules; track m.slug) {
              <a class="erp-sidebar__link" [routerLink]="['/app/m', m.slug]" routerLinkActive="active">
                <i class="ph {{ m.icon }} erp-sidebar__icon"></i><span>{{ m.name }}</span>
              </a>
            }
          }
        </nav>
      </aside>

      <header class="erp-topbar">
        <div class="iq-cmd" role="search" tabindex="0">
          <i class="ph ph-sparkle"></i>
          <span>Ask IQ anything — e.g. "show overdue invoices"</span>
          <span class="iq-cmd__kbd">⌘K</span>
        </div>
        <div class="d-flex align-items-center gap-3">
          <button class="btn btn-sm btn-icon" title="Notifications"><i class="ph ph-bell"></i></button>
          <div class="iq-user">
            <div class="iq-user__avatar">{{ initials() }}</div>
            <div class="iq-user__meta">
              <div class="iq-user__name">{{ store.user()?.displayName || store.user()?.username }}</div>
              <div class="iq-user__role">{{ store.user()?.email }}</div>
            </div>
          </div>
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
  protected readonly branding = inject(BrandingService);
  private readonly integrationSettings = inject(IntegrationSettingsService);
  protected readonly modules = MODULES;

  /** Sub-modules for a module, hiding config-gated entries (e.g. the logs page). */
  protected subModulesFor(mod: ErpModule): SubModule[] {
    return mod.subModules.filter((s) => s.slug !== 'integrations' || this.integrationSettings.logsUiEnabled());
  }
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Sidebar collapse — persisted so it sticks across navigations and reloads. */
  protected readonly collapsed = signal<boolean>(localStorage.getItem('erp.sidebarCollapsed') === '1');
  protected toggleCollapse(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    localStorage.setItem('erp.sidebarCollapsed', next ? '1' : '0');
  }

  private readonly url = signal(this.router.url);
  protected readonly activeModule = computed(() => {
    const segs = this.url().split('?')[0]!.split('/').filter(Boolean); // ['app','m','inventory','items']
    return segs[1] === 'm' && segs[2] ? findModule(segs[2]) : undefined;
  });

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }

  protected initials(): string {
    const n = this.store.user()?.displayName || this.store.user()?.username || '?';
    return n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  }

  protected logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}

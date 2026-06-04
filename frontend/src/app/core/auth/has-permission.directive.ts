import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthStore } from '../state/auth.store';

/**
 * Structural directive that renders its content only if the user holds the given
 * permission(s) — `*hasPermission="'master:create'"` or an array (any-of). Reacts
 * to permission-snapshot changes (signals), so a live server-side grant change
 * shows/hides UI without a reload. UX only — the backend guard is the real gate.
 */
@Directive({ selector: '[hasPermission]' })
export class HasPermissionDirective {
  private readonly store = inject(AuthStore);
  private readonly tpl = inject(TemplateRef);
  private readonly vcr = inject(ViewContainerRef);
  private rendered = false;

  readonly hasPermission = input.required<string | string[]>();

  constructor() {
    effect(() => {
      const required = this.hasPermission();
      const keys = Array.isArray(required) ? required : [required];
      const allowed = this.store.hasAnyPermission(keys);
      if (allowed && !this.rendered) {
        this.vcr.createEmbeddedView(this.tpl);
        this.rendered = true;
      } else if (!allowed && this.rendered) {
        this.vcr.clear();
        this.rendered = false;
      }
    });
  }
}

import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/** Generic stub for routes whose feature screens arrive in a later phase. */
@Component({
  selector: 'erp-placeholder',
  template: `
    <h4>{{ title }}</h4>
    <p class="text-muted">This screen is coming in a later phase.</p>
  `,
})
export class PlaceholderComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly title = (this.route.snapshot.data['title'] as string) ?? 'Screen';
}

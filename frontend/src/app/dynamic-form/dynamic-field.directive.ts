import { Directive, type OnInit, ViewContainerRef, inject, input } from '@angular/core';
import type { FormControl } from '@angular/forms';
import { FALLBACK_FIELD_TYPE, FIELD_COMPONENTS } from './field-registry';
import { CssMapService } from './css-map.service';
import type { FormFieldDef } from '../core/models/api.models';

/**
 * Picks the field component for a field — by its `type` in the JSON — renders it,
 * and wires the field config + FormControl + the css.json-resolved control class.
 * `<ng-container [erpDynamicField]="field" [control]="ctrl" [formSlug]="slug" />`
 */
@Directive({ selector: '[erpDynamicField]' })
export class DynamicFieldDirective implements OnInit {
  readonly erpDynamicField = input.required<FormFieldDef>();
  readonly control = input.required<FormControl>();
  readonly formSlug = input<string>('');

  private readonly vcr = inject(ViewContainerRef);
  private readonly css = inject(CssMapService);

  ngOnInit(): void {
    const field = this.erpDynamicField();
    const component = FIELD_COMPONENTS[field.type] ?? FIELD_COMPONENTS[FALLBACK_FIELD_TYPE];
    const ref = this.vcr.createComponent(component);
    ref.setInput('config', field);
    ref.setInput('control', this.control());

    // Only override the component's natural control class when css.json provides one.
    const controlClass = this.css.controlClass(this.formSlug(), field.key);
    if (controlClass) ref.setInput('controlClass', controlClass);
  }
}

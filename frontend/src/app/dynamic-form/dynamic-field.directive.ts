import { Directive, type OnInit, ViewContainerRef, inject, input } from '@angular/core';
import type { FormControl } from '@angular/forms';
import { FALLBACK_FIELD_TYPE, FIELD_COMPONENTS } from './field-registry';
import type { FormFieldDef } from '../core/models/api.models';

/**
 * Picks the right field component for a field — by its `type` in the JSON — and
 * renders it, wiring the field config + FormControl as inputs. Used by the
 * dynamic-form component: `<ng-container [erpDynamicField]="field" [control]="ctrl" />`.
 */
@Directive({ selector: '[erpDynamicField]' })
export class DynamicFieldDirective implements OnInit {
  readonly erpDynamicField = input.required<FormFieldDef>();
  readonly control = input.required<FormControl>();
  private readonly vcr = inject(ViewContainerRef);

  ngOnInit(): void {
    const field = this.erpDynamicField();
    const component = FIELD_COMPONENTS[field.type] ?? FIELD_COMPONENTS[FALLBACK_FIELD_TYPE];
    const ref = this.vcr.createComponent(component);
    ref.setInput('config', field);
    ref.setInput('control', this.control());
  }
}

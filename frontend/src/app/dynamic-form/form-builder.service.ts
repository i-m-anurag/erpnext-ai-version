import { Injectable } from '@angular/core';
import { FormControl, FormGroup, type ValidatorFn, Validators } from '@angular/forms';
import type { FormDefinition, FormFieldDef } from '../core/models/api.models';

/**
 * Builds a reactive FormGroup from a form definition — controls keyed by field
 * `key`, with validators derived from each field's rules. The use-case component
 * calls this, then hands the config + group to <erp-dynamic-form>.
 */
@Injectable({ providedIn: 'root' })
export class FormBuilderService {
  build(config: FormDefinition): FormGroup {
    const controls: Record<string, FormControl> = {};
    for (const field of config.fields) {
      controls[field.key] = new FormControl(this.defaultValue(field), {
        validators: this.validatorsFor(field),
        nonNullable: field.type === 'checkbox',
      });
    }
    return new FormGroup(controls);
  }

  private defaultValue(field: FormFieldDef): unknown {
    switch (field.type) {
      case 'checkbox':
        return false;
      case 'multiselect':
        return [];
      default:
        return null;
    }
  }

  private validatorsFor(field: FormFieldDef): ValidatorFn[] {
    const v: ValidatorFn[] = [];
    if (field.required) v.push(field.type === 'checkbox' ? Validators.requiredTrue : Validators.required);
    const rules = field.validators;
    if (rules) {
      if (rules.minLength !== undefined) v.push(Validators.minLength(rules.minLength));
      if (rules.maxLength !== undefined) v.push(Validators.maxLength(rules.maxLength));
      if (rules.min !== undefined) v.push(Validators.min(rules.min));
      if (rules.max !== undefined) v.push(Validators.max(rules.max));
      if (rules.pattern) v.push(Validators.pattern(rules.pattern));
    }
    return v;
  }
}

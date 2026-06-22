import { Injectable } from '@angular/core';
import { type AbstractControl, FormArray, FormControl, FormGroup, type ValidatorFn, Validators } from '@angular/forms';
import type { FormDefinition, FormFieldDef } from '../core/models/api.models';

/**
 * Builds a reactive form from a form definition — controls keyed by field `key`,
 * with validators derived from each field's rules. A `table` field becomes a
 * FormArray of row FormGroups (one control per column). `initial` pre-populates
 * values, sizing table rows to the incoming data, so the use-case component can
 * build + patch in one call (FormArray rows can't be added by patchValue alone).
 */
@Injectable({ providedIn: 'root' })
export class FormBuilderService {
  build(config: FormDefinition, initial?: Record<string, unknown>): FormGroup {
    const controls: Record<string, AbstractControl> = {};
    for (const field of config.fields) {
      controls[field.key] = this.buildControl(field, initial?.[field.key]);
    }
    return new FormGroup(controls);
  }

  /** A single row FormGroup for a table field (one control per column). */
  buildRowGroup(columns: FormFieldDef[], row?: Record<string, unknown>): FormGroup {
    const controls: Record<string, AbstractControl> = {};
    for (const col of columns) {
      controls[col.key] = this.buildControl(col, row?.[col.key]);
    }
    return new FormGroup(controls);
  }

  private buildControl(field: FormFieldDef, value: unknown): AbstractControl {
    if (field.type === 'table') {
      return this.buildTable(field, value as Record<string, unknown>[] | undefined);
    }
    return new FormControl(
      { value: value ?? this.defaultValue(field), disabled: field.auto === true },
      {
        validators: this.validatorsFor(field),
        nonNullable: field.type === 'checkbox',
      },
    );
  }

  private buildTable(field: FormFieldDef, rows?: Record<string, unknown>[]): FormArray {
    const columns = field.columns ?? [];
    const initial = rows ?? [];
    const count = Math.max(initial.length, field.minRows ?? 0);
    const groups: FormGroup[] = [];
    for (let i = 0; i < count; i++) groups.push(this.buildRowGroup(columns, initial[i]));
    const validators: ValidatorFn[] = [];
    if (field.required || field.minRows) {
      const min = field.minRows ?? 1;
      validators.push((c) => ((c as FormArray).length >= min ? null : { minRows: { required: min } }));
    }
    return new FormArray<FormGroup>(groups, validators);
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

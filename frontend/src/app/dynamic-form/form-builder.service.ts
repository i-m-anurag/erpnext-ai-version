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
    this.addControls(config.fields, controls, initial);
    return new FormGroup(controls);
  }

  /**
   * Add a control per field to `controls`. Display groups (`type:'group'` without
   * `nested:true`) are transparent — their children are added at the SAME level
   * (so they stay flat top-level controls). Data groups (`nested:true`) become a
   * single nested FormGroup via buildControl.
   */
  private addControls(
    fields: FormFieldDef[],
    controls: Record<string, AbstractControl>,
    initial?: Record<string, unknown>,
  ): void {
    for (const field of fields) {
      if (field.type === 'group' && field.nested !== true) {
        this.addControls(field.fields ?? [], controls, initial);
      } else {
        controls[field.key] = this.buildControl(field, initial?.[field.key]);
      }
    }
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
    if (field.type === 'group') {
      return this.buildGroup(field, value as Record<string, unknown> | undefined);
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

  /** A nested FormGroup for a `group` field — one control per sub-field. */
  buildGroup(field: FormFieldDef, value?: Record<string, unknown>): FormGroup {
    const controls: Record<string, AbstractControl> = {};
    for (const sub of field.fields ?? []) {
      controls[sub.key] = this.buildControl(sub, value?.[sub.key]);
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

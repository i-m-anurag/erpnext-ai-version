import { Component, computed, input } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import type { FormFieldDef } from '../../core/models/api.models';

@Component({
  selector: 'erp-select-field',
  imports: [ReactiveFormsModule, NgSelectModule],
  template: `
    <ng-select
      [items]="options()"
      bindValue="value"
      bindLabel="label"
      [multiple]="multiple()"
      [formControl]="control()"
      [placeholder]="config().placeholder ?? 'Select…'"
      [class.is-invalid]="invalid()"
    />
  `,
})
export class SelectFieldComponent {
  readonly config = input.required<FormFieldDef>();
  readonly control = input.required<FormControl>();
  readonly options = computed(() => this.config().options ?? []);
  readonly multiple = computed(() => this.config().type === 'multiselect');

  invalid(): boolean {
    const c = this.control();
    return c.invalid && (c.touched || c.dirty);
  }
}

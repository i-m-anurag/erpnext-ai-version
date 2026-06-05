import { Component, input } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import type { FormFieldDef } from '../../core/models/api.models';

@Component({
  selector: 'erp-checkbox-field',
  imports: [ReactiveFormsModule],
  template: `
    <div class="form-check">
      <input
        type="checkbox"
        [class]="controlClass()"
        [id]="config().key"
        [formControl]="control()"
      />
      <label class="form-check-label" [attr.for]="config().key">{{ config().label }}</label>
    </div>
  `,
})
export class CheckboxFieldComponent {
  readonly config = input.required<FormFieldDef>();
  readonly control = input.required<FormControl>();
  readonly controlClass = input<string>('form-check-input');
}

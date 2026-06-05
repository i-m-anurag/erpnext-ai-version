import { Component, input } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import type { FormFieldDef } from '../../core/models/api.models';

@Component({
  selector: 'erp-date-field',
  imports: [ReactiveFormsModule, BsDatepickerModule],
  template: `
    <input
      type="text"
      [class]="controlClass()"
      bsDatepicker
      [id]="config().key"
      [formControl]="control()"
      [placeholder]="config().placeholder ?? 'Select date…'"
      [class.is-invalid]="invalid()"
      [bsConfig]="{ adaptivePosition: true, containerClass: 'theme-default' }"
    />
  `,
})
export class DateFieldComponent {
  readonly config = input.required<FormFieldDef>();
  readonly control = input.required<FormControl>();
  readonly controlClass = input<string>('form-control');

  invalid(): boolean {
    const c = this.control();
    return c.invalid && (c.touched || c.dirty);
  }
}

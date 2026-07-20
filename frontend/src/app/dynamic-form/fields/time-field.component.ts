import { Component, input } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import type { FormFieldDef } from '../../core/models/api.models';

/** Time-of-day field (e.g. a document's posting time) — native picker, HH:mm:ss. */
@Component({
  selector: 'erp-time-field',
  imports: [ReactiveFormsModule],
  template: `
    <input
      type="time"
      step="1"
      [class]="controlClass()"
      [id]="config().key"
      [formControl]="control()"
      [class.is-invalid]="invalid()"
    />
  `,
})
export class TimeFieldComponent {
  readonly config = input.required<FormFieldDef>();
  readonly control = input.required<FormControl>();
  readonly controlClass = input<string>('form-control');

  invalid(): boolean {
    const c = this.control();
    return c.invalid && (c.touched || c.dirty);
  }
}

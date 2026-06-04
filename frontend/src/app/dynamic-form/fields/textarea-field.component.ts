import { Component, input } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import type { FormFieldDef } from '../../core/models/api.models';

@Component({
  selector: 'erp-textarea-field',
  imports: [ReactiveFormsModule],
  template: `
    <textarea
      class="form-control"
      rows="3"
      [id]="config().key"
      [formControl]="control()"
      [placeholder]="config().placeholder ?? ''"
      [class.is-invalid]="invalid()"
    ></textarea>
  `,
})
export class TextareaFieldComponent {
  readonly config = input.required<FormFieldDef>();
  readonly control = input.required<FormControl>();

  invalid(): boolean {
    const c = this.control();
    return c.invalid && (c.touched || c.dirty);
  }
}

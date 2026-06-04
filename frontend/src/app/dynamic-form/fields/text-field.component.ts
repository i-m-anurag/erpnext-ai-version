import { Component, computed, input } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import type { FormFieldDef } from '../../core/models/api.models';

@Component({
  selector: 'erp-text-field',
  imports: [ReactiveFormsModule],
  template: `
    <input
      [type]="type()"
      class="form-control"
      [id]="config().key"
      [formControl]="control()"
      [placeholder]="config().placeholder ?? ''"
      [class.is-invalid]="invalid()"
    />
  `,
})
export class TextFieldComponent {
  readonly config = input.required<FormFieldDef>();
  readonly control = input.required<FormControl>();
  readonly type = computed(() => (this.config().type === 'number' ? 'number' : 'text'));

  invalid(): boolean {
    const c = this.control();
    return c.invalid && (c.touched || c.dirty);
  }
}

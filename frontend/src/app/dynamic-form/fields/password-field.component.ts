import { Component, input, signal } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import type { FormFieldDef } from '../../core/models/api.models';

@Component({
  selector: 'erp-password-field',
  imports: [ReactiveFormsModule],
  template: `
    <div class="input-group">
      <input
        [type]="show() ? 'text' : 'password'"
        [class]="controlClass()"
        [id]="config().key"
        [formControl]="control()"
        [placeholder]="config().placeholder ?? ''"
        [class.is-invalid]="invalid()"
        autocomplete="current-password"
      />
      <button type="button" class="btn btn-outline-secondary" (click)="show.set(!show())">
        {{ show() ? 'Hide' : 'Show' }}
      </button>
    </div>
  `,
})
export class PasswordFieldComponent {
  readonly config = input.required<FormFieldDef>();
  readonly control = input.required<FormControl>();
  readonly controlClass = input<string>('form-control');
  readonly show = signal(false);

  invalid(): boolean {
    const c = this.control();
    return c.invalid && (c.touched || c.dirty);
  }
}

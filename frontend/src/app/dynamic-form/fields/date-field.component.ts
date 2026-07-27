import { Component, input } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import type { FormFieldDef } from '../../core/models/api.models';

@Component({
  selector: 'erp-date-field',
  imports: [ReactiveFormsModule, BsDatepickerModule],
  template: `
    <div class="erp-date">
      <input
        type="text"
        [class]="controlClass()"
        class="erp-date__input"
        bsDatepicker
        #dp="bsDatepicker"
        [id]="config().key"
        [formControl]="control()"
        [placeholder]="config().placeholder ?? 'Select date…'"
        [class.is-invalid]="invalid()"
        [bsConfig]="{ adaptivePosition: true, containerClass: 'theme-default', dateInputFormat: 'DD-MM-YYYY' }"
      />
      <i class="ph ph-calendar-blank erp-date__icon" (click)="dp.toggle()" aria-hidden="true"></i>
    </div>
  `,
  styles: [`
    .erp-date { position: relative; }
    .erp-date__input { padding-right: 2rem; }
    .erp-date__icon {
      position: absolute; right: 0.6rem; top: 50%; transform: translateY(-50%);
      color: var(--erp-text-muted); cursor: pointer; pointer-events: auto;
    }
    .erp-date__input:disabled + .erp-date__icon { cursor: not-allowed; opacity: 0.6; }
  `],
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

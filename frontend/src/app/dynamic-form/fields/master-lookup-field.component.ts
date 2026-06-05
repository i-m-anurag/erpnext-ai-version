import { Component, inject, input, OnInit, signal } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { MasterApiService } from '../../core/api/master.api.service';
import type { FormFieldDef, MasterOption } from '../../core/models/api.models';

@Component({
  selector: 'erp-master-lookup-field',
  imports: [ReactiveFormsModule, NgSelectModule],
  template: `
    <ng-select
      [class]="controlClass()"
      [items]="options()"
      bindValue="value"
      bindLabel="label"
      [loading]="loading()"
      [formControl]="control()"
      [placeholder]="config().placeholder ?? 'Select…'"
      [class.is-invalid]="invalid()"
    />
  `,
})
export class MasterLookupFieldComponent implements OnInit {
  readonly config = input.required<FormFieldDef>();
  readonly control = input.required<FormControl>();
  readonly controlClass = input<string>('');
  private readonly api = inject(MasterApiService);

  readonly options = signal<MasterOption[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    const master = this.config().optionsSource?.master;
    if (!master) return;
    this.loading.set(true);
    this.api.getOptions(master).subscribe({
      next: (opts) => {
        this.options.set(opts);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  invalid(): boolean {
    const c = this.control();
    return c.invalid && (c.touched || c.dirty);
  }
}

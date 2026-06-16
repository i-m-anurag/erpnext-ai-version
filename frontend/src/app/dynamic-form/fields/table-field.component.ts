import { Component, computed, inject, input, signal } from '@angular/core';
import { type FormArray, type FormControl, type FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { FormFieldDef } from '../../core/models/api.models';
import { DynamicFieldDirective } from '../dynamic-field.directive';
import { FormBuilderService } from '../form-builder.service';

/**
 * Tabular field: renders a `FormArray` of row `FormGroup`s as an editable grid
 * with add/remove rows. Each cell reuses the same dynamic-field directive as the
 * main form, so every field type (text, number, select, date, master-lookup …)
 * works inside a row. Respects min/max rows.
 */
@Component({
  selector: 'erp-table-field',
  imports: [ReactiveFormsModule, DynamicFieldDirective],
  template: `
    <div class="iq-tablefield">
      <table class="iq-tablefield__table">
        <thead>
          <tr>
            @for (col of columns(); track col.key) {
              <th>{{ col.label }}@if (col.required) { <span class="text-danger">*</span> }</th>
            }
            <th class="iq-tablefield__rowaction"></th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row; let i = $index) {
            <tr [formGroup]="row">
              @for (col of columns(); track col.key) {
                <td><ng-container [erpDynamicField]="col" [control]="cell(row, col.key)" [formSlug]="formSlug()" /></td>
              }
              <td class="iq-tablefield__rowaction">
                <button type="button" class="btn-icon" (click)="removeRow(i)" [disabled]="!canRemove()" aria-label="Remove row">
                  <i class="ph ph-trash"></i>
                </button>
              </td>
            </tr>
          }
          @if (rows().length === 0) {
            <tr><td [attr.colspan]="columns().length + 1" class="text-muted text-center py-3">No rows yet.</td></tr>
          }
        </tbody>
      </table>
      <button type="button" class="btn btn-sm btn-light mt-2" (click)="addRow()" [disabled]="!canAdd()">
        <i class="ph ph-plus"></i> Add row
      </button>
    </div>
  `,
})
export class TableFieldComponent {
  readonly config = input.required<FormFieldDef>();
  /** The FormArray for this field (rows of FormGroups). */
  readonly control = input.required<FormArray>();
  readonly controlClass = input<string>('');
  readonly formSlug = input<string>('');

  private readonly fb = inject(FormBuilderService);
  /** Bumped on add/remove so the rows() view re-reads the FormArray. */
  private readonly version = signal(0);

  protected readonly columns = computed<FormFieldDef[]>(() => this.config().columns ?? []);
  protected readonly rows = computed<FormGroup[]>(() => {
    this.version();
    return this.control().controls as FormGroup[];
  });

  protected cell(row: FormGroup, key: string): FormControl {
    return row.get(key) as FormControl;
  }

  protected canAdd(): boolean {
    const max = this.config().maxRows;
    return max === undefined || this.control().length < max;
  }
  protected canRemove(): boolean {
    return this.control().length > (this.config().minRows ?? 0);
  }

  protected addRow(): void {
    if (!this.canAdd()) return;
    this.control().push(this.fb.buildRowGroup(this.columns()));
    this.version.update((v) => v + 1);
  }
  protected removeRow(i: number): void {
    if (!this.canRemove()) return;
    this.control().removeAt(i);
    this.version.update((v) => v + 1);
  }
}

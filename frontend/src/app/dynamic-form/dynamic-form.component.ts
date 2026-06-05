import { Component, computed, inject, input, output } from '@angular/core';
import { type FormControl, type FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DynamicFieldDirective } from './dynamic-field.directive';
import { CssMapService } from './css-map.service';
import type { FormDefinition, FormFieldDef } from '../core/models/api.models';

/**
 * Renders a reactive form from a JSON definition + a FormGroup. All wrapper
 * classes resolve from css.json keyed by the form's slug (slug → part → node),
 * so each div is configurable per form. The control class is resolved per field
 * and passed down to the field component.
 */
@Component({
  selector: 'erp-dynamic-form',
  imports: [ReactiveFormsModule, DynamicFieldDirective],
  template: `
    <form [formGroup]="group()" [class]="formClass()" (ngSubmit)="submitted.emit()">
      @for (field of fields(); track field.key) {
        @if (isVisible(field)) {
          <div [class]="fieldClass(field.key)">
            @if (field.type !== 'checkbox') {
              <label [class]="labelClass(field.key)" [attr.for]="field.key">
                {{ field.label }}@if (field.required) { <span class="text-danger"> *</span> }
              </label>
            }
            <ng-container [erpDynamicField]="field" [control]="controlFor(field.key)" [formSlug]="slug()" />
            @if (showError(field.key)) {
              <div [class]="errorClass(field.key)">{{ errorText(field.key) }}</div>
            }
          </div>
        }
      }
      <div [class]="actionsClass()">
        <ng-content />
      </div>
    </form>
  `,
})
export class DynamicFormComponent {
  readonly config = input.required<FormDefinition>();
  readonly group = input.required<FormGroup>();
  readonly submitted = output<void>();

  private readonly css = inject(CssMapService);
  protected readonly slug = computed(() => this.config().slug);
  protected readonly fields = computed(() => this.config().fields);

  protected formClass(): string {
    return this.css.formClass(this.slug(), this.config().layout === 'two-column');
  }
  protected fieldClass(key: string): string {
    return this.css.fieldClass(this.slug(), key);
  }
  protected labelClass(key: string): string {
    return this.css.labelClass(this.slug(), key);
  }
  protected errorClass(key: string): string {
    return this.css.errorClass(this.slug(), key);
  }
  protected actionsClass(): string {
    return this.css.actionsClass(this.slug());
  }

  protected controlFor(key: string): FormControl {
    return this.group().get(key) as FormControl;
  }

  protected isVisible(field: FormFieldDef): boolean {
    const cond = field.visibleWhen;
    if (!cond) return true;
    return this.group().get(cond.field)?.value === cond.equals;
  }

  protected showError(key: string): boolean {
    const c = this.group().get(key);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  protected errorText(key: string): string {
    const errors = this.group().get(key)?.errors;
    if (!errors) return '';
    if (errors['required'] || errors['requiredTrue']) return 'This field is required';
    if (errors['minlength']) return `Minimum ${errors['minlength'].requiredLength} characters`;
    if (errors['maxlength']) return `Maximum ${errors['maxlength'].requiredLength} characters`;
    if (errors['min']) return `Must be at least ${errors['min'].min}`;
    if (errors['max']) return `Must be at most ${errors['max'].max}`;
    if (errors['pattern']) return 'Invalid format';
    return 'Invalid value';
  }
}

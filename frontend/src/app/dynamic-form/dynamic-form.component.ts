import { Component, computed, inject, input, output } from '@angular/core';
import { type FormControl, type FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DynamicFieldDirective } from './dynamic-field.directive';
import { CssMapService } from './css-map.service';
import type { FormDefinition, FormFieldDef } from '../core/models/api.models';

/**
 * Renders a reactive form from a JSON definition + a FormGroup. The use-case
 * component passes `[config]` and `[group]`; this component does all the field
 * generation/mapping (via DynamicFieldDirective) and applies css.json classes to
 * the wrapper elements so the same form can be molded per deployment.
 *
 * Action buttons are projected via <ng-content> into the actions slot, and the
 * form emits `(submitted)` on a valid native submit.
 */
@Component({
  selector: 'erp-dynamic-form',
  imports: [ReactiveFormsModule, DynamicFieldDirective],
  template: `
    <form [formGroup]="group()" [class]="formClass()" (ngSubmit)="submitted.emit()">
      @for (field of fields(); track field.key) {
        @if (isVisible(field)) {
          <div [class]="fieldClass(field)">
            @if (field.type !== 'checkbox') {
              <label [class]="css.cls('label')" [attr.for]="field.key">
                {{ field.label }}@if (field.required) { <span class="text-danger"> *</span> }
              </label>
            }
            <ng-container [erpDynamicField]="field" [control]="controlFor(field.key)" />
            @if (showError(field.key)) {
              <div [class]="css.cls('error')">{{ errorText(field.key) }}</div>
            }
          </div>
        }
      }
      <div [class]="css.cls('actions')">
        <ng-content />
      </div>
    </form>
  `,
})
export class DynamicFormComponent {
  readonly config = input.required<FormDefinition>();
  readonly group = input.required<FormGroup>();
  readonly submitted = output<void>();

  protected readonly css = inject(CssMapService);
  protected readonly fields = computed(() => this.config().fields);
  protected readonly formClass = computed(() =>
    this.config().layout === 'two-column' ? this.css.cls('form.two-column') : this.css.cls('form'),
  );

  protected fieldClass(field: FormFieldDef): string {
    return field.cssSlug ? this.css.cls('field', `field.${field.cssSlug}`) : this.css.cls('field');
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

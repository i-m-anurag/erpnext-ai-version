import { Component, computed, inject, input } from '@angular/core';
import { type AbstractControl, type FormControl, type FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { FormFieldDef } from '../../core/models/api.models';
import { DynamicFieldDirective } from '../dynamic-field.directive';
import { CssMapService } from '../css-map.service';

/**
 * Group field: a nested `FormGroup` rendered as a sub-section. Each sub-field
 * reuses the same dynamic-field directive as the main form (so every field type
 * works inside a group, including nested groups). The whole group is stored as a
 * single jsonb sub-object on the backend. Mirrors table-field's self-rendering to
 * avoid importing DynamicFormComponent (which would create a circular import).
 */
@Component({
  selector: 'erp-group-field',
  imports: [ReactiveFormsModule, DynamicFieldDirective],
  template: `
    <div class="iq-groupfield" [formGroup]="control()">
      @for (sub of fields(); track sub.key) {
        @if (isVisible(sub)) {
          <div [class]="fieldClass(sub.key)" [attr.data-field]="sub.key">
            @if (sub.type !== 'checkbox') {
              <label [class]="labelClass(sub.key)" [attr.for]="sub.key">
                {{ sub.label }}@if (sub.required) { <span class="text-danger"> *</span> }
              </label>
            }
            <ng-container [erpDynamicField]="sub" [control]="ctrl(sub.key)" [formSlug]="formSlug()" />
            @if (showError(sub.key)) {
              <div [class]="errorClass(sub.key)">{{ errorText(sub.key) }}</div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class GroupFieldComponent {
  readonly config = input.required<FormFieldDef>();
  /** The nested FormGroup for this field. */
  readonly control = input.required<FormGroup>();
  readonly controlClass = input<string>('');
  readonly formSlug = input<string>('');

  private readonly css = inject(CssMapService);
  protected readonly fields = computed<FormFieldDef[]>(() => this.config().fields ?? []);

  protected ctrl(key: string): FormControl {
    return this.control().get(key) as FormControl;
  }

  protected fieldClass(key: string): string {
    return this.css.fieldClass(this.formSlug(), key);
  }
  protected labelClass(key: string): string {
    return this.css.labelClass(this.formSlug(), key);
  }
  protected errorClass(key: string): string {
    return this.css.errorClass(this.formSlug(), key);
  }

  protected isVisible(field: FormFieldDef): boolean {
    const cond = field.visibleWhen;
    if (!cond) return true;
    return this.control().get(cond.field)?.value === cond.equals;
  }

  protected showError(key: string): boolean {
    const c = this.control().get(key);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  protected errorText(key: string): string {
    return errorMessage(this.control().get(key)?.errors ?? null);
  }
}

/** Shared error-key → message mapping (kept in sync with DynamicFormComponent). */
function errorMessage(errors: AbstractControl['errors']): string {
  if (!errors) return '';
  if (errors['required'] || errors['requiredTrue']) return 'This field is required';
  if (errors['minlength']) return `Minimum ${errors['minlength'].requiredLength} characters`;
  if (errors['maxlength']) return `Maximum ${errors['maxlength'].requiredLength} characters`;
  if (errors['min']) return `Must be at least ${errors['min'].min}`;
  if (errors['max']) return `Must be at most ${errors['max'].max}`;
  if (errors['pattern']) return 'Invalid format';
  return 'Invalid value';
}

import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { type FormControl, type FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DynamicFieldDirective } from './dynamic-field.directive';
import './fields/table-field.register'; // registers the `table` field type (side-effect)
import './fields/group-field.register'; // registers the `group` field type (side-effect)
import { CssMapService } from './css-map.service';
import type { FormDefinition, FormFieldDef } from '../core/models/api.models';

type VisibilityEffect = { source: string; when: boolean };

/**
 * Renders a reactive form from a JSON definition + a FormGroup. All wrapper
 * classes resolve from css.json keyed by the form's slug (slug → part → node),
 * so each div is configurable per form. The control class is resolved per field
 * and passed down to the field component.
 *
 * Groups come in two flavours, both `type: 'group'`:
 *  • DISPLAY group (default) — a collapsible accordion section; its children are
 *    flat top-level controls, rendered recursively inline.
 *  • DATA group (`nested: true`) — a nested FormGroup persisted as one jsonb
 *    sub-object; the body is delegated to the dynamic-field directive, which
 *    renders GroupFieldComponent against the nested control.
 */
@Component({
  selector: 'erp-dynamic-form',
  imports: [ReactiveFormsModule, DynamicFieldDirective, NgTemplateOutlet],
  template: `
    <form [formGroup]="group()" [class]="formClass()" (ngSubmit)="submitted.emit()">
      <ng-container *ngTemplateOutlet="fieldList; context: { $implicit: fields() }" />

      <ng-template #fieldList let-list>
        @for (field of list; track field.key) {
          @if (isVisible(field)) {
            @if (field.type === 'group') {
              <section class="erp-form-group erp-field--full" [class.erp-form-group--collapsed]="isGroupCollapsed(field)">
                <button
                  type="button"
                  class="erp-form-group__header"
                  [disabled]="field.collapsible === false"
                  [attr.aria-expanded]="!isGroupCollapsed(field)"
                  (click)="toggleGroup(field)"
                >
                  <span>{{ field.label }}</span>
                  @if (field.collapsible !== false) {
                    <i class="ph" [class.ph-caret-up]="!isGroupCollapsed(field)" [class.ph-caret-down]="isGroupCollapsed(field)"></i>
                  }
                </button>

                @if (!isGroupCollapsed(field)) {
                  <div [class]="groupBodyClass(field)">
                    @if (isDataGroup(field)) {
                      <!-- data group: one nested control rendered by GroupFieldComponent -->
                      <ng-container [erpDynamicField]="field" [control]="controlFor(field.key)" [formSlug]="slug()" />
                    } @else {
                      <!-- display group: flat children rendered recursively -->
                      <ng-container *ngTemplateOutlet="fieldList; context: { $implicit: childFields(field) }" />
                    }
                  </div>
                }
              </section>
            } @else {
              <div [class]="fieldWrapperClass(field)">
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
        }
      </ng-template>

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
  private readonly collapsedGroups = signal<Record<string, boolean>>({});
  protected readonly slug = computed(() => this.config().slug);
  protected readonly fields = computed(() => this.config().fields);
  private readonly visibilityEffects = computed(() => this.collectVisibilityEffects(this.config().fields));

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

  /** Table and data groups span the full form width; otherwise the css.json class. */
  protected fieldWrapperClass(field: FormFieldDef): string {
    return field.type === 'table' ? `${this.fieldClass(field.key)} erp-field--full` : this.fieldClass(field.key);
  }

  /** A data group (`nested: true`) backs a single nested FormGroup (jsonb). */
  protected isDataGroup(field: FormFieldDef): boolean {
    return field.type === 'group' && field.nested === true;
  }

  protected childFields(field: FormFieldDef): FormFieldDef[] {
    return field.fields ?? [];
  }

  protected groupBodyClass(field: FormFieldDef): string {
    // A data group lets GroupFieldComponent own the grid, so keep the body plain.
    if (this.isDataGroup(field)) return 'erp-form-group__body';
    const layout = field.layout ?? this.config().layout;
    return layout === 'two-column' ? 'erp-form-group__body erp-form--two-column' : 'erp-form-group__body';
  }

  protected isGroupCollapsed(field: FormFieldDef): boolean {
    if (field.collapsible === false) return false;
    return this.collapsedGroups()[field.key] ?? field.defaultCollapsed === true;
  }

  protected toggleGroup(field: FormFieldDef): void {
    if (field.collapsible === false) return;
    const collapsed = this.isGroupCollapsed(field);
    this.collapsedGroups.update((groups) => ({ ...groups, [field.key]: !collapsed }));
  }

  protected controlFor(key: string): FormControl {
    return this.group().get(key) as FormControl;
  }

  protected isVisible(field: FormFieldDef): boolean {
    const cond = field.visibleWhen;
    if (cond && this.group().get(cond.field)?.value !== cond.equals) return false;

    const effects = this.visibilityEffects()[field.key] ?? [];
    if (effects.length === 0) return true;
    return effects.some((effect) => this.group().get(effect.source)?.value === effect.when);
  }

  private collectVisibilityEffects(fields: FormFieldDef[]): Record<string, VisibilityEffect[]> {
    const effects: Record<string, VisibilityEffect[]> = {};
    for (const field of fields) {
      if (field.type === 'group') {
        // Only display groups flatten their children to the top level; data-group
        // children live in their own FormGroup and manage their own visibility.
        if (field.nested === true) continue;
        const childEffects = this.collectVisibilityEffects(field.fields ?? []);
        for (const [target, rules] of Object.entries(childEffects)) {
          effects[target] = [...(effects[target] ?? []), ...rules];
        }
        continue;
      }
      if (field.type !== 'checkbox') continue;
      for (const target of field.effects?.checked?.showFields ?? []) {
        effects[target] = [...(effects[target] ?? []), { source: field.key, when: true }];
      }
      for (const target of field.effects?.unchecked?.showFields ?? []) {
        effects[target] = [...(effects[target] ?? []), { source: field.key, when: false }];
      }
    }
    return effects;
  }

  protected showError(key: string): boolean {
    const c = this.group().get(key);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  protected errorText(key: string): string {
    const errors = this.group().get(key)?.errors;
    if (!errors) return '';
    if (errors['minRows']) return `Add at least ${errors['minRows'].required} row(s)`;
    if (errors['required'] || errors['requiredTrue']) return 'This field is required';
    if (errors['minlength']) return `Minimum ${errors['minlength'].requiredLength} characters`;
    if (errors['maxlength']) return `Maximum ${errors['maxlength'].requiredLength} characters`;
    if (errors['min']) return `Must be at least ${errors['min'].min}`;
    if (errors['max']) return `Must be at most ${errors['max'].max}`;
    if (errors['pattern']) return 'Invalid format';
    return 'Invalid value';
  }
}

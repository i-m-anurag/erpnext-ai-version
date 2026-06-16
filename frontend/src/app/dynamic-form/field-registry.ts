import type { Type } from '@angular/core';
import { TextFieldComponent } from './fields/text-field.component';
import { PasswordFieldComponent } from './fields/password-field.component';
import { TextareaFieldComponent } from './fields/textarea-field.component';
import { CheckboxFieldComponent } from './fields/checkbox-field.component';
import { SelectFieldComponent } from './fields/select-field.component';
import { DateFieldComponent } from './fields/date-field.component';
import { MasterLookupFieldComponent } from './fields/master-lookup-field.component';
// NOTE: `table` is registered separately (fields/table-field.register.ts) to avoid a
// circular import — TableFieldComponent imports DynamicFieldDirective, which imports
// this registry. Registering it here would leave the directive undefined at eval time.

/**
 * Maps a field `type` (from the JSON form definition) to the component that
 * renders it. Adding a new field type = build a component + register it here.
 */
export const FIELD_COMPONENTS: Record<string, Type<unknown>> = {
  text: TextFieldComponent,
  number: TextFieldComponent,
  password: PasswordFieldComponent,
  textarea: TextareaFieldComponent,
  select: SelectFieldComponent,
  multiselect: SelectFieldComponent,
  checkbox: CheckboxFieldComponent,
  date: DateFieldComponent,
  'master-lookup': MasterLookupFieldComponent,
  file: TextFieldComponent, // placeholder until a dedicated upload component lands
  // 'table' is added at runtime by fields/table-field.register.ts (see note above).
};

export const FALLBACK_FIELD_TYPE = 'text';

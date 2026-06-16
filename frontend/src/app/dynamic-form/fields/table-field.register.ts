import { FIELD_COMPONENTS } from '../field-registry';
import { TableFieldComponent } from './table-field.component';

/**
 * Side-effect registration of the `table` field type. Kept out of field-registry.ts
 * to break a circular import (TableFieldComponent → DynamicFieldDirective →
 * field-registry). Imported once by DynamicFormComponent so the directive module is
 * fully initialized before TableFieldComponent's decorator references it.
 */
FIELD_COMPONENTS['table'] = TableFieldComponent;

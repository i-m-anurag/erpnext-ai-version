import { FIELD_COMPONENTS } from '../field-registry';
import { GroupFieldComponent } from './group-field.component';

/**
 * Side-effect registration of the `group` field type. Kept out of field-registry.ts
 * for the same reason as `table` — GroupFieldComponent → DynamicFieldDirective →
 * field-registry would form a circular import. Imported once by DynamicFormComponent.
 */
FIELD_COMPONENTS['group'] = GroupFieldComponent;

import { BadRequestError } from '../../shared/errors.js';
import type { FormDefinition, FormField } from './form.schema.js';

/**
 * Validate a data payload against a form definition (§5.1 — "server-side
 * validation generated from the same JSON"). Checks required fields, basic types,
 * and per-field validators; returns the payload narrowed to declared fields.
 * Throws BadRequestError with per-field details on failure.
 *
 * `table` fields are validated recursively: each row object is validated against
 * the field's `columns` (a nested form), and errors are reported per-cell as
 * `field[rowIndex].column`.
 *
 * Note: referential checks for master-lookup values (that the referenced master
 * row exists) and visibleWhen-conditional requiredness are intentionally left for
 * a later iteration — they're treated as plain strings here.
 */
export function validateFormData(
  form: FormDefinition,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const { out, errors } = validateFields(form.fields, input);
  if (Object.keys(errors).length > 0) {
    throw new BadRequestError('Validation failed', errors);
  }
  return out;
}

/** Validate a flat object against a list of fields; returns narrowed output + errors map. */
function validateFields(
  fields: FormField[],
  input: Record<string, unknown>,
): { out: Record<string, unknown>; errors: Record<string, string> } {
  const out: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = input[field.key];
    const missing = value === undefined || value === null || value === '';

    if (field.required && missing) {
      errors[field.key] = 'is required';
      continue;
    }
    if (missing) continue;

    if (field.type === 'table') {
      const rows = validateTable(field, value, errors);
      out[field.key] = rows;
      continue;
    }

    switch (field.type) {
      case 'number':
        if (typeof value !== 'number') {
          errors[field.key] = 'must be a number';
          continue;
        }
        break;
      case 'checkbox':
        if (typeof value !== 'boolean') {
          errors[field.key] = 'must be a boolean';
          continue;
        }
        break;
      case 'multiselect':
        if (!Array.isArray(value)) {
          errors[field.key] = 'must be an array';
          continue;
        }
        break;
      default:
        if (typeof value !== 'string') {
          errors[field.key] = 'must be a string';
          continue;
        }
    }

    const v = field.validators;
    if (v) {
      if (typeof value === 'string') {
        if (v.minLength !== undefined && value.length < v.minLength) errors[field.key] = `min length ${v.minLength}`;
        else if (v.maxLength !== undefined && value.length > v.maxLength) errors[field.key] = `max length ${v.maxLength}`;
        else if (v.pattern && !new RegExp(v.pattern).test(value)) errors[field.key] = 'invalid format';
      } else if (typeof value === 'number') {
        if (v.min !== undefined && value < v.min) errors[field.key] = `must be ≥ ${v.min}`;
        else if (v.max !== undefined && value > v.max) errors[field.key] = `must be ≤ ${v.max}`;
      }
    }

    if (!errors[field.key]) out[field.key] = value;
  }

  return { out, errors };
}

/** Validate a tabular field: an array of row objects against `columns`. */
function validateTable(field: FormField, value: unknown, errors: Record<string, string>): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    errors[field.key] = 'must be an array of rows';
    return [];
  }
  if (field.minRows !== undefined && value.length < field.minRows) {
    errors[field.key] = `needs at least ${field.minRows} row(s)`;
  }
  if (field.maxRows !== undefined && value.length > field.maxRows) {
    errors[field.key] = `allows at most ${field.maxRows} row(s)`;
  }
  const columns = field.columns ?? [];
  const rows: Record<string, unknown>[] = [];
  value.forEach((row, i) => {
    if (typeof row !== 'object' || row === null) {
      errors[`${field.key}[${i}]`] = 'must be an object';
      return;
    }
    const { out, errors: rowErrors } = validateFields(columns, row as Record<string, unknown>);
    for (const [k, msg] of Object.entries(rowErrors)) errors[`${field.key}[${i}].${k}`] = msg;
    rows.push(out);
  });
  return rows;
}

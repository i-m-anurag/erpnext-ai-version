import { BadRequestError } from '../../shared/errors.js';
import type { FormDefinition } from './form.schema.js';

/**
 * Validate a data payload against a form definition (§5.1 — "server-side
 * validation generated from the same JSON"). Checks required fields, basic types,
 * and per-field validators; returns the payload narrowed to declared fields.
 * Throws BadRequestError with per-field details on failure.
 *
 * Note: referential checks for master-lookup values (that the referenced master
 * row exists) and visibleWhen-conditional requiredness are intentionally left for
 * a later iteration — they're treated as plain strings here.
 */
export function validateFormData(
  form: FormDefinition,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of form.fields) {
    const value = input[field.key];
    const missing = value === undefined || value === null || value === '';

    if (field.required && missing) {
      errors[field.key] = 'is required';
      continue;
    }
    if (missing) continue;

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

  if (Object.keys(errors).length > 0) {
    throw new BadRequestError('Validation failed', errors);
  }
  return out;
}

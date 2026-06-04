import { describe, it, expect } from 'vitest';
import { validateFormData } from './form.validation.js';
import type { FormDefinition } from './form.schema.js';

const form: FormDefinition = {
  slug: 'master-item',
  title: 'Item',
  layout: 'two-column',
  fields: [
    { key: 'sku', type: 'text', label: 'SKU', required: true, validators: { maxLength: 5 } },
    { key: 'name', type: 'text', label: 'Name', required: true },
    { key: 'qty', type: 'number', label: 'Qty', validators: { min: 0 } },
  ],
};

describe('validateFormData', () => {
  it('accepts valid data and narrows to declared fields', () => {
    const out = validateFormData(form, { sku: 'ABC', name: 'Widget', extra: 'dropme' });
    expect(out).toEqual({ sku: 'ABC', name: 'Widget' });
  });

  it('rejects missing required fields', () => {
    expect(() => validateFormData(form, { sku: 'ABC' })).toThrow(/Validation failed/);
  });

  it('enforces type checks', () => {
    expect(() => validateFormData(form, { sku: 'ABC', name: 'W', qty: 'nope' })).toThrow(/Validation/);
  });

  it('enforces string validators (maxLength)', () => {
    expect(() => validateFormData(form, { sku: 'TOOLONG', name: 'W' })).toThrow(/Validation/);
  });

  it('enforces number validators (min)', () => {
    expect(() => validateFormData(form, { sku: 'A', name: 'W', qty: -1 })).toThrow(/Validation/);
  });
});

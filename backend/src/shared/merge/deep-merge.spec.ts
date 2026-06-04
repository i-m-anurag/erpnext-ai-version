import { describe, it, expect } from 'vitest';
import { deepMerge } from './deep-merge.js';

describe('deepMerge', () => {
  it('overrides scalars field-by-field, keeps untouched keys', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it('merges nested objects recursively', () => {
    expect(deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 9 } })).toEqual({ a: { x: 1, y: 9 } });
  });

  it('replaces arrays that are not configured to merge by key', () => {
    expect(deepMerge({ tags: ['a', 'b'] }, { tags: ['c'] })).toEqual({ tags: ['c'] });
  });

  it('deletes a key when the override value is null', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: null })).toEqual({ a: 1 });
  });

  const fieldsMerge = { fields: 'key' };

  it('merges arrays by identity key: patches existing, appends new, keeps base order', () => {
    const base = { fields: [{ key: 'sku', label: 'SKU' }, { key: 'name', label: 'Name' }] };
    const override = { fields: [{ key: 'name', label: 'Full Name' }, { key: 'type', label: 'Type' }] };
    expect(deepMerge(base, override, fieldsMerge)).toEqual({
      fields: [
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: 'Full Name' },
        { key: 'type', label: 'Type' },
      ],
    });
  });

  it('tombstones a base array element via __deleted', () => {
    const base = { fields: [{ key: 'sku' }, { key: 'name' }] };
    const override = { fields: [{ key: 'name', __deleted: true }] };
    expect(deepMerge(base, override, fieldsMerge)).toEqual({ fields: [{ key: 'sku' }] });
  });
});

import { describe, it, expect } from 'vitest';
import { applyCalculations, applyDefaults } from './calculate.js';
import type { FormDefinition } from './form.schema.js';

/** A cut-down Purchase Invoice with the real dependency chain:
 *  items[].amount → totalAmount → additionalDiscountAmount → grandTotal
 *  → roundingAdjustment → roundedTotal
 *  Deliberately declared OUT of dependency order to prove ordering works. */
const PI = {
  slug: 'pi', title: 'PI', layout: 'two-column',
  fields: [
    { key: 'roundedTotal', type: 'number', label: 'Rounded Total',
      calculate: { expression: 'grandTotal + roundingAdjustment', precision: 2 } },
    { key: 'grandTotal', type: 'number', label: 'Grand Total',
      calculate: { expression: 'totalAmount - additionalDiscountAmount', precision: 2 } },
    { key: 'additionalDiscountPercentage', type: 'number', label: 'Disc %' },
    { key: 'additionalDiscountAmount', type: 'number', label: 'Disc Amt',
      calculate: { expression: '(additionalDiscountPercentage / 100) * totalAmount', precision: 2 } },
    { key: 'roundingAdjustment', type: 'number', label: 'Rounding',
      calculate: { expression: 'round(grandTotal,0) - grandTotal', precision: 2 } },
    { key: 'totalAmount', type: 'number', label: 'Total Amount',
      calculate: { expression: 'sum(items.amount)', precision: 2 } },
    {
      key: 'items', type: 'table', label: 'Items',
      columns: [
        { key: 'quantity', type: 'number', label: 'Qty' },
        { key: 'rate', type: 'number', label: 'Rate' },
        { key: 'amount', type: 'number', label: 'Amount',
          calculate: { expression: 'quantity * rate', precision: 2 } },
      ],
    },
  ],
} as unknown as FormDefinition;

describe('form calculations', () => {
  it('computes row amounts, then totals, in dependency order', () => {
    const out = applyCalculations(PI, {
      additionalDiscountPercentage: 10,
      items: [
        { quantity: 2, rate: 1500 },
        { quantity: 3, rate: 100 },
      ],
    });

    expect((out['items'] as Record<string, unknown>[])[0]!['amount']).toBe(3000);
    expect((out['items'] as Record<string, unknown>[])[1]!['amount']).toBe(300);
    expect(out['totalAmount']).toBe(3300);
    expect(out['additionalDiscountAmount']).toBe(330);
    expect(out['grandTotal']).toBe(2970);
    expect(out['roundingAdjustment']).toBe(0);
    expect(out['roundedTotal']).toBe(2970);
  });

  it('rounds to the field precision (and round() to whole rupees)', () => {
    const out = applyCalculations(PI, {
      additionalDiscountPercentage: 0,
      items: [{ quantity: 3, rate: 33.333 }], // 99.999
    });
    expect(out['totalAmount']).toBe(100); // 99.999 -> row precision 2 -> 100.00
    expect(out['grandTotal']).toBe(100);
    expect(out['roundingAdjustment']).toBe(0);
  });

  it('overwrites client-supplied values — the server is authoritative', () => {
    const out = applyCalculations(PI, {
      additionalDiscountPercentage: 0,
      grandTotal: 999999, // a tampered/stale client value
      items: [{ quantity: 1, rate: 50 }],
    });
    expect(out['grandTotal']).toBe(50);
  });

  it('treats an empty document as zeros rather than NaN', () => {
    const out = applyCalculations(PI, {});
    expect(out['totalAmount']).toBe(0);
    expect(out['grandTotal']).toBe(0);
  });

  it('does not mutate the input object', () => {
    const input = { items: [{ quantity: 2, rate: 10 }] };
    applyCalculations(PI, input);
    expect(input.items[0]).toEqual({ quantity: 2, rate: 10 });
  });

  it('throws on a circular dependency instead of looping', () => {
    const bad = {
      slug: 'bad', title: 'Bad', layout: 'two-column',
      fields: [
        { key: 'a', type: 'number', label: 'A', calculate: { expression: 'b + 1' } },
        { key: 'b', type: 'number', label: 'B', calculate: { expression: 'a + 1' } },
      ],
    } as unknown as FormDefinition;
    expect(() => applyCalculations(bad, {})).toThrow(/circular calculate dependency/i);
  });

  it('fills $today / $nowTime defaults only when the field is blank', () => {
    const form = {
      slug: 'd', title: 'D', layout: 'two-column',
      fields: [
        { key: 'date', type: 'date', label: 'Date', defaultValue: '$today' },
        { key: 'postingTime', type: 'time', label: 'Time', defaultValue: '$nowTime' },
        { key: 'purpose', type: 'text', label: 'Purpose', defaultValue: 'PURCHASE' },
      ],
    } as unknown as FormDefinition;

    const out = applyDefaults(form, { purpose: 'SERVICE' });
    expect(out['date']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out['postingTime']).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(out['purpose']).toBe('SERVICE'); // caller's value wins
  });
});

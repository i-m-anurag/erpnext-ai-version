import { describe, it, expect } from 'vitest';
import { evaluateExpression, referencedFields, assertValidExpression } from './expression.js';

const ev = (src: string, ctx: Record<string, unknown> = {}, p?: number) => evaluateExpression(src, ctx, p);

describe('form calculate expressions', () => {
  it('evaluates arithmetic with correct precedence and parens', () => {
    expect(ev('2 + 3 * 4')).toBe(14);
    expect(ev('(2 + 3) * 4')).toBe(20);
    expect(ev('10 - 2 - 3')).toBe(5); // left-associative
    expect(ev('-5 + 2')).toBe(-3);
  });

  it('reads field references, treating missing/blank as zero', () => {
    expect(ev('quantity * rate', { quantity: 2, rate: 1500 })).toBe(3000);
    expect(ev('quantity * rate', { quantity: 2 })).toBe(0); // rate missing
    expect(ev('a + b', { a: '5', b: '' })).toBe(5); // string/blank coercion
  });

  it('sums a table column', () => {
    const ctx = { items: [{ amount: 100.5 }, { amount: 200.25 }, { amount: 0 }] };
    expect(ev('sum(items.amount)', ctx)).toBe(300.75);
    expect(ev('sum(items.amount)', { items: [] })).toBe(0);
    expect(ev('sum(items.amount)', {})).toBe(0); // table absent
  });

  it('rounds via round() and via precision', () => {
    expect(ev('round(10.4,0)')).toBe(10);
    expect(ev('round(10.5,0)')).toBe(11);
    expect(ev('round(grandTotal,0) - grandTotal', { grandTotal: 99.6 })).toBe(0.4);
    expect(ev('1 / 3', {}, 2)).toBe(0.33);
  });

  it('computes a percentage discount without float drift', () => {
    // 0.1 + 0.2 style drift is why this runs on decimal.js
    expect(ev('(additionalDiscountPercentage / 100) * totalAmount', {
      additionalDiscountPercentage: 10,
      totalAmount: 3000,
    }, 2)).toBe(300);
    expect(ev('a + b', { a: 0.1, b: 0.2 }, 2)).toBe(0.3);
  });

  it('returns 0 for divide-by-zero instead of NaN/Infinity', () => {
    expect(ev('total / count', { total: 10, count: 0 })).toBe(0);
  });

  it('rejects anything that is not plain arithmetic (no code execution)', () => {
    expect(() => ev('process.exit(1)')).toThrow(/unknown function/i);
    expect(() => ev('1; drop table gl_entry')).toThrow();
    expect(() => ev('a ** b')).toThrow();
    expect(() => ev('(1 + 2')).toThrow(/expected/i);
    expect(() => ev('sum(items)')).toThrow(/table column/i);
  });

  it('reports referenced fields for dependency ordering', () => {
    expect(referencedFields('totalAmount - additionalDiscountAmount').sort())
      .toEqual(['additionalDiscountAmount', 'totalAmount']);
    expect(referencedFields('sum(items.amount)')).toEqual(['items']);
    expect(referencedFields('round(grandTotal,0) - grandTotal')).toEqual(['grandTotal']);
  });

  it('assertValidExpression surfaces bad config at seed time', () => {
    expect(() => assertValidExpression('quantity * rate')).not.toThrow();
    expect(() => assertValidExpression('quantity * ')).toThrow();
  });
});

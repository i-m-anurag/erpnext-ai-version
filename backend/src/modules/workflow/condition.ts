import type { Condition } from './workflow.schema.js';

/**
 * Evaluate a branch's conditions (ANDed) against a record's data. Structured
 * (field/op/value), so the UI builds them from the entity's form fields — no
 * free-text expressions. An empty list = the else branch (always true).
 */
export function evaluateConditions(conditions: Condition[], data: Record<string, unknown>): boolean {
  return conditions.every((c) => evalOne(c, data));
}

function evalOne(c: Condition, data: Record<string, unknown>): boolean {
  const lhs = data[c.field];
  const rhs = c.value;
  switch (c.op) {
    case '==':
      return looseEq(lhs, rhs);
    case '!=':
      return !looseEq(lhs, rhs);
    case '<':
      return Number(lhs) < Number(rhs);
    case '<=':
      return Number(lhs) <= Number(rhs);
    case '>':
      return Number(lhs) > Number(rhs);
    case '>=':
      return Number(lhs) >= Number(rhs);
    default:
      return false;
  }
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  // numbers vs numeric strings compare by value; everything else by string
  if (typeof b === 'number' || typeof a === 'number') return Number(a) === Number(b);
  if (typeof b === 'boolean' || typeof a === 'boolean') return Boolean(a) === Boolean(b);
  return String(a) === String(b);
}

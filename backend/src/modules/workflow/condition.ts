import jsonLogic from 'json-logic-js';
import type { Condition, RuleBranch } from './workflow.schema.js';

/**
 * Evaluate a branch's condition. Prefers a JSONLogic `when` (safe, serializable,
 * evaluated over the full attribute context — doc.* / user.* / system.* / lookup.*);
 * falls back to the legacy structured `conditions` (over doc.* only). An empty
 * branch = the else branch (always true).
 */
export function evaluateBranch(branch: RuleBranch, context: Record<string, unknown>): boolean {
  if (branch.when) return jsonLogic.apply(branch.when as Parameters<typeof jsonLogic.apply>[0], context) === true;
  const doc = (context.doc as Record<string, unknown> | undefined) ?? {};
  return evaluateConditions(branch.conditions, doc);
}

/**
 * Legacy structured conditions (field/op/value), ANDed, over a record's data.
 * Kept for definitions authored before JSONLogic; new branches use `when`.
 */
export function evaluateConditions(conditions: Condition[], data: Record<string, unknown>): boolean {
  return conditions.every((c) => evalOne(c, data));
}

function evalOne(c: Condition, data: Record<string, unknown>): boolean {
  const lhs = data[c.field];
  // dynamic RHS: another field's value takes precedence over a literal.
  const rhs = c.valueField !== undefined ? data[c.valueField] : c.value;
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

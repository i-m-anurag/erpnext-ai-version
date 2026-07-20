import { evaluateExpression, referencedFields } from './expression.js';
import { flattenDataFields, type FormDefinition, type FormField } from './form.schema.js';

/**
 * Derives every `calculate` field on a document, server-side, so the stored values are
 * authoritative no matter what the client sent (a browser can't be trusted with the
 * numbers the ledger will post).
 *
 * Two passes, because totals depend on rows:
 *   1. row level — each table row's computed columns (e.g. amount = quantity * rate)
 *   2. top level — in DEPENDENCY order, so e.g. totalAmount → additionalDiscountAmount
 *      → grandTotal → roundingAdjustment → roundedTotal all settle in one pass.
 */

interface Calc {
  key: string;
  expression: string;
  precision?: number;
}

const calcsOf = (fields: FormField[]): Calc[] =>
  fields
    .filter((f) => f.calculate?.expression)
    .map((f) => ({ key: f.key, expression: f.calculate!.expression, precision: f.calculate!.precision }));

/**
 * Topologically order calculated fields so each is evaluated after everything it
 * reads. References to non-calculated fields are plain inputs and need no ordering.
 * Throws on a cycle rather than looping or silently producing a stale number.
 */
function inDependencyOrder(calcs: Calc[]): Calc[] {
  const byKey = new Map(calcs.map((c) => [c.key, c]));
  const state = new Map<string, 'visiting' | 'done'>();
  const order: Calc[] = [];

  const visit = (key: string, trail: string[]): void => {
    if (state.get(key) === 'done') return;
    if (state.get(key) === 'visiting') {
      throw new Error(`circular calculate dependency: ${[...trail, key].join(' → ')}`);
    }
    const calc = byKey.get(key);
    if (!calc) return; // plain input field
    state.set(key, 'visiting');
    for (const dep of referencedFields(calc.expression)) visit(dep, [...trail, key]);
    state.set(key, 'done');
    order.push(calc);
  };

  for (const c of calcs) visit(c.key, []);
  return order;
}

/** Apply a form's `calculate` fields to a data object, returning a new object. */
export function applyCalculations(form: FormDefinition, data: Record<string, unknown>): Record<string, unknown> {
  const fields = flattenDataFields(form.fields);
  const out = { ...data };

  // 1. Row-level columns (e.g. items[].amount = quantity * rate).
  for (const field of fields) {
    if (field.type !== 'table' || !Array.isArray(out[field.key])) continue;
    const colCalcs = inDependencyOrder(calcsOf(field.columns ?? []));
    if (colCalcs.length === 0) continue;
    out[field.key] = (out[field.key] as Record<string, unknown>[]).map((row) => {
      const next = { ...row };
      for (const c of colCalcs) next[c.key] = evaluateExpression(c.expression, next, c.precision);
      return next;
    });
  }

  // 2. Top-level fields, in dependency order (rows above are already settled).
  for (const c of inDependencyOrder(calcsOf(fields))) {
    out[c.key] = evaluateExpression(c.expression, out, c.precision);
  }

  return out;
}

/** ISO date / time-of-day tokens usable as a field `defaultValue`. */
export function resolveDefaultValue(value: unknown): unknown {
  if (value === '$today') return new Date().toISOString().slice(0, 10);
  if (value === '$nowTime') return new Date().toTimeString().slice(0, 8);
  return value;
}

/** Fill in `defaultValue` for fields the caller left blank (create path). */
export function applyDefaults(form: FormDefinition, data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  for (const f of flattenDataFields(form.fields)) {
    if (f.defaultValue === undefined) continue;
    const current = out[f.key];
    if (current === undefined || current === null || current === '') {
      out[f.key] = resolveDefaultValue(f.defaultValue);
    }
  }
  return out;
}

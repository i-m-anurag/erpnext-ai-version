/**
 * Tiny SAFE condition evaluator for workflow transition guards. NO eval —
 * supports `doc.<field> <op> <literal>` comparisons joined by `&&`. Unknown
 * grammar fails closed (returns false). v1 intentionally minimal; expand later.
 */
export function evaluateCondition(expr: string | null, doc: Record<string, unknown>): boolean {
  if (!expr || !expr.trim()) return true;
  try {
    return expr.split('&&').every((clause) => evalComparison(clause.trim(), doc));
  } catch {
    return false;
  }
}

const CLAUSE = /^doc\.([a-zA-Z0-9_]+)\s*(==|!=|<=|>=|<|>)\s*(.+)$/;

function evalComparison(clause: string, doc: Record<string, unknown>): boolean {
  const m = clause.match(CLAUSE);
  if (!m) throw new Error(`bad condition clause: ${clause}`);
  const field = m[1];
  const op = m[2];
  const rhsRaw = m[3];
  if (field === undefined || op === undefined || rhsRaw === undefined) throw new Error('bad clause');
  const lhs = doc[field];
  const rhs = parseLiteral(rhsRaw.trim());
  switch (op) {
    case '==':
      return lhs == rhs;
    case '!=':
      return lhs != rhs;
    case '<':
      return Number(lhs) < Number(rhs);
    case '<=':
      return Number(lhs) <= Number(rhs);
    case '>':
      return Number(lhs) > Number(rhs);
    case '>=':
      return Number(lhs) >= Number(rhs);
    default:
      throw new Error(`bad operator: ${op}`);
  }
}

function parseLiteral(s: string): unknown {
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  return s.replace(/^['"]|['"]$/g, '');
}

import { Decimal } from 'decimal.js';

/**
 * A tiny, safe arithmetic evaluator for form `calculate` expressions — e.g.
 *   "quantity * rate"
 *   "sum(items.amount)"
 *   "round(grandTotal,0) - grandTotal"
 *   "(additionalDiscountPercentage / 100) * totalAmount"
 *
 * Deliberately NOT `eval`/`Function`: form definitions are config that ships per
 * client, so an expression must never be able to execute arbitrary code. Only
 * numbers, field references, + - * / ( ), unary minus, and the functions
 * `sum(table.column)` and `round(value, places)` are supported. Anything else is a
 * parse error, surfaced when the form is seeded/saved rather than silently ignored.
 *
 * Arithmetic runs on decimal.js (same as the ledger) so money math doesn't drift.
 */

type Node =
  | { k: 'num'; v: string }
  | { k: 'ref'; path: string }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; l: Node; r: Node }
  | { k: 'neg'; e: Node }
  | { k: 'call'; name: string; args: Node[] };

type Token = { t: 'num' | 'ident' | 'op'; v: string };

const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/y;
const NUM_RE = /\d+(?:\.\d+)?/y;

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if ('+-*/(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    NUM_RE.lastIndex = i;
    const num = NUM_RE.exec(src);
    if (num) { out.push({ t: 'num', v: num[0] }); i = NUM_RE.lastIndex; continue; }
    IDENT_RE.lastIndex = i;
    const id = IDENT_RE.exec(src);
    if (id) { out.push({ t: 'ident', v: id[0] }); i = IDENT_RE.lastIndex; continue; }
    throw new Error(`unexpected character "${c}" in expression: ${src}`);
  }
  return out;
}

/** Recursive-descent parser: expr → term → unary → primary. */
function parse(tokens: Token[], src: string): Node {
  let p = 0;
  const peek = (): Token | undefined => tokens[p];
  const eat = (v: string): void => {
    if (tokens[p]?.v !== v) throw new Error(`expected "${v}" in expression: ${src}`);
    p++;
  };

  const expr = (): Node => {
    let left = term();
    for (;;) {
      const op = peek();
      if (op?.t === 'op' && (op.v === '+' || op.v === '-')) {
        p++;
        left = { k: 'bin', op: op.v, l: left, r: term() };
      } else return left;
    }
  };

  const term = (): Node => {
    let left = unary();
    for (;;) {
      const op = peek();
      if (op?.t === 'op' && (op.v === '*' || op.v === '/')) {
        p++;
        left = { k: 'bin', op: op.v, l: left, r: unary() };
      } else return left;
    }
  };

  const unary = (): Node => {
    if (peek()?.v === '-') { p++; return { k: 'neg', e: unary() }; }
    return primary();
  };

  const primary = (): Node => {
    const tk = peek();
    if (!tk) throw new Error(`unexpected end of expression: ${src}`);
    if (tk.t === 'num') { p++; return { k: 'num', v: tk.v }; }
    if (tk.t === 'ident') {
      p++;
      if (peek()?.v === '(') {
        p++;
        const args: Node[] = [];
        if (peek()?.v !== ')') {
          args.push(expr());
          while (peek()?.v === ',') { p++; args.push(expr()); }
        }
        eat(')');
        return { k: 'call', name: tk.v, args };
      }
      return { k: 'ref', path: tk.v };
    }
    if (tk.v === '(') { p++; const e = expr(); eat(')'); return e; }
    throw new Error(`unexpected "${tk.v}" in expression: ${src}`);
  };

  const node = expr();
  if (p !== tokens.length) throw new Error(`trailing input in expression: ${src}`);
  return node;
}

const cache = new Map<string, Node>();
function ast(src: string): Node {
  let n = cache.get(src);
  if (!n) { n = parse(tokenize(src), src); cache.set(src, n); }
  return n;
}

const num = (v: unknown): Decimal => {
  if (v === null || v === undefined || v === '') return new Decimal(0);
  const d = new Decimal(String(v));
  return d.isFinite() ? d : new Decimal(0);
};

function evalNode(n: Node, ctx: Record<string, unknown>): Decimal {
  switch (n.k) {
    case 'num':
      return new Decimal(n.v);
    case 'ref':
      return num(ctx[n.path]);
    case 'neg':
      return evalNode(n.e, ctx).negated();
    case 'bin': {
      const l = evalNode(n.l, ctx);
      const r = evalNode(n.r, ctx);
      if (n.op === '+') return l.plus(r);
      if (n.op === '-') return l.minus(r);
      if (n.op === '*') return l.times(r);
      return r.isZero() ? new Decimal(0) : l.dividedBy(r); // divide-by-zero → 0, not NaN
    }
    case 'call': {
      if (n.name === 'sum') {
        const arg = n.args[0];
        if (!arg || arg.k !== 'ref' || !arg.path.includes('.')) {
          throw new Error('sum() takes a table column, e.g. sum(items.amount)');
        }
        const [table, col] = arg.path.split('.') as [string, string];
        const rows = ctx[table];
        if (!Array.isArray(rows)) return new Decimal(0);
        return rows.reduce<Decimal>((s, row) => s.plus(num((row as Record<string, unknown>)[col])), new Decimal(0));
      }
      if (n.name === 'round') {
        const v = evalNode(n.args[0]!, ctx);
        const places = n.args[1] ? evalNode(n.args[1], ctx).toNumber() : 0;
        return v.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
      }
      throw new Error(`unknown function "${n.name}()" in expression`);
    }
  }
}

/** Evaluate an expression against a data context. Returns a number. */
export function evaluateExpression(src: string, ctx: Record<string, unknown>, precision?: number): number {
  const value = evalNode(ast(src), ctx);
  const rounded = precision === undefined ? value : value.toDecimalPlaces(precision, Decimal.ROUND_HALF_UP);
  return rounded.toNumber();
}

/** The field keys an expression reads — used to compute fields in dependency order.
 *  A `sum(items.amount)` reference yields the table key (`items`). */
export function referencedFields(src: string): string[] {
  const out = new Set<string>();
  const walk = (n: Node): void => {
    switch (n.k) {
      case 'ref':
        out.add(n.path.includes('.') ? n.path.split('.')[0]! : n.path);
        break;
      case 'neg':
        walk(n.e);
        break;
      case 'bin':
        walk(n.l); walk(n.r);
        break;
      case 'call':
        n.args.forEach(walk);
        break;
      default:
        break;
    }
  };
  walk(ast(src));
  return [...out];
}

/** Parse-check an expression (used when validating a form definition). */
export function assertValidExpression(src: string): void {
  ast(src);
}

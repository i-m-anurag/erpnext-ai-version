import { accountService } from '../accounts/index.js';
import { BadRequestError } from '../../shared/errors.js';
import type { PostingLine, Voucher } from './ledger.service.js';

/**
 * A config-driven mapping from a document to its GL posting — "for THIS voucher
 * type, Debit account X and Credit account Y for the value in field Z". Keeps the
 * document → account mapping out of code, so tuning postings is a config edit.
 *
 * A line names its account one of three ways:
 *   - `account`      a fixed code from the Chart of Accounts ("purchase-expenses")
 *   - `accountField` read the code from a document field ("accountPaidTo")
 *   - `accountRole`  resolve by CoA role ("Payable"), so no code is hardcoded
 *
 * A rule is either flat (`lines` — always post these) or conditional (`cases` — post
 * the first case whose `when` matches), which lets one document type branch (e.g.
 * Payment Entry's Pay vs Receive) without that logic living in code.
 */
export interface PostingRuleLine {
  account?: string;
  accountField?: string;
  accountRole?: 'Payable' | 'Receivable' | 'Cash' | 'Bank';
  side: 'debit' | 'credit';
  /** Field holding this line's amount; defaults to the rule-level `amountField`. */
  amountField?: string;
  /**
   * Take the amount from a value the caller computed instead of a document field —
   * the key into `buildVoucher`'s `computed` map. Stock documents need this: the
   * value of a Material Issue is its moving-average valuation, which the ledger
   * works out at posting time and the document never stores.
   */
  amountSource?: string;
  /** Field holding the party code for this line. */
  partyField?: string;
  /** Use the rule-level `partyField` for this line. */
  withParty?: boolean;
}

/**
 * A case matches on one field, either by value (`equals`) or by presence (`isSet`).
 * Presence is what lets a Purchase Invoice ask "did this come from a receipt?" —
 * the answer decides whether it clears Stock Received But Not Billed or expenses
 * the purchase directly.
 */
export interface PostingRuleCase {
  when: { field: string; equals?: unknown; isSet?: boolean };
  lines: PostingRuleLine[];
}

export interface PostingRule {
  voucherType: string;
  /** Default amount field for lines that don't name one. */
  amountField?: string;
  /** Default party field for lines flagged `withParty`. */
  partyField?: string;
  /** Unconditional posting. */
  lines?: PostingRuleLine[];
  /** Conditional posting — first matching case wins. */
  cases?: PostingRuleCase[];
}

const registry = new Map<string, PostingRule>();

export function registerPostingRule(rule: PostingRule): void {
  registry.set(rule.voucherType, rule);
}

/** The posting rule for a voucher type (= master slug), or undefined if none. */
export function getPostingRule(voucherType: string): PostingRule | undefined {
  return registry.get(voucherType);
}

/** Is a document field populated? Blank strings count as absent, not as a value. */
function isSet(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

/** Does this case's condition hold for the document? */
function caseMatches(c: PostingRuleCase, data: Record<string, unknown>): boolean {
  const value = data[c.when.field];
  if (c.when.isSet !== undefined) return isSet(value) === c.when.isSet;
  return value === c.when.equals;
}

/** The lines that apply to this document — the flat set, or the matching case. */
function selectLines(rule: PostingRule, data: Record<string, unknown>): PostingRuleLine[] {
  if (rule.cases?.length) {
    const hit = rule.cases.find((c) => caseMatches(c, data));
    if (!hit) {
      throw new BadRequestError(
        `no posting rule case matches ${rule.voucherType}.${rule.cases[0]!.when.field} = ${String(
          data[rule.cases[0]!.when.field],
        )}`,
      );
    }
    return hit.lines;
  }
  return rule.lines ?? [];
}

/** Resolve a line's account: fixed code, document field, or Chart-of-Accounts role. */
async function resolveAccount(rl: PostingRuleLine, data: Record<string, unknown>): Promise<string> {
  if (rl.account) return rl.account;
  if (rl.accountField) {
    const code = data[rl.accountField];
    if (!code) throw new BadRequestError(`missing account in field "${rl.accountField}"`);
    return String(code);
  }
  if (rl.accountRole) return accountService.resolveByType(rl.accountRole);
  throw new Error('posting rule line needs one of: account, accountField, accountRole');
}

/** A line's amount: a caller-computed value if it names one, else a document field. */
function amountFor(
  rule: PostingRule,
  rl: PostingRuleLine,
  data: Record<string, unknown>,
  computed: Record<string, number | string>,
): number {
  if (rl.amountSource) {
    if (!(rl.amountSource in computed)) {
      throw new Error(`posting rule ${rule.voucherType} wants amountSource "${rl.amountSource}", which was not supplied`);
    }
    return Number(computed[rl.amountSource] ?? 0);
  }
  const amountField = rl.amountField ?? rule.amountField;
  if (!amountField) throw new Error(`posting rule ${rule.voucherType} has no amountField`);
  return Number(data[amountField] ?? 0);
}

/**
 * Build a balanced voucher from a posted document using its rule. Reads each line's
 * amount (and party) off the document data — or, for an `amountSource` line, off the
 * `computed` values the caller worked out (stock valuation). Lines with a zero amount
 * are dropped so an empty invoice posts nothing.
 */
export async function buildVoucher(
  rule: PostingRule,
  doc: { code: string; data: Record<string, unknown> },
  postingDate: Date | string,
  computed: Record<string, number | string> = {},
): Promise<Voucher> {
  const lines: PostingLine[] = [];
  for (const rl of selectLines(rule, doc.data)) {
    const amount = amountFor(rule, rl, doc.data, computed);
    if (!amount) continue;
    const partyField = rl.partyField ?? (rl.withParty ? rule.partyField : undefined);
    lines.push({
      account: await resolveAccount(rl, doc.data),
      debit: rl.side === 'debit' ? amount : 0,
      credit: rl.side === 'credit' ? amount : 0,
      party: partyField ? ((doc.data[partyField] as string | undefined) ?? null) : null,
    });
  }
  return { voucherType: rule.voucherType, voucherNo: doc.code, postingDate, lines };
}

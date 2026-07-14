import type { PostingLine, Voucher } from './ledger.service.js';

/**
 * A config-driven mapping from a document to its GL posting — "for THIS voucher
 * type, Debit account X and Credit account Y for the value in field Z". Keeps the
 * document → account mapping out of code, so tuning postings is a config edit.
 */
export interface PostingRuleLine {
  account: string;
  side: 'debit' | 'credit';
  /** The document field holding the amount for this line (e.g. "grandTotal"). */
  amountField: string;
  /** The document field holding the party (supplier/customer) code, if any. */
  partyField?: string;
}

export interface PostingRule {
  voucherType: string;
  lines: PostingRuleLine[];
}

const registry = new Map<string, PostingRule>();

export function registerPostingRule(rule: PostingRule): void {
  registry.set(rule.voucherType, rule);
}

/** The posting rule for a voucher type (= master slug), or undefined if none. */
export function getPostingRule(voucherType: string): PostingRule | undefined {
  return registry.get(voucherType);
}

/**
 * Build a balanced voucher from a posted document using its rule. Reads each line's
 * amount (and party) off the document data; lines with a zero amount are dropped so
 * an empty invoice posts nothing.
 */
export function buildVoucher(
  rule: PostingRule,
  doc: { code: string; data: Record<string, unknown> },
  postingDate: Date | string,
): Voucher {
  const lines: PostingLine[] = [];
  for (const rl of rule.lines) {
    const amount = Number(doc.data[rl.amountField] ?? 0);
    if (!amount) continue;
    lines.push({
      account: rl.account,
      debit: rl.side === 'debit' ? amount : 0,
      credit: rl.side === 'credit' ? amount : 0,
      party: rl.partyField ? (doc.data[rl.partyField] as string | undefined) ?? null : null,
    });
  }
  return { voucherType: rule.voucherType, voucherNo: doc.code, postingDate, lines };
}

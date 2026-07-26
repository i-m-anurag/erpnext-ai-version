import type { EntityManager } from 'typeorm';
import { ledgerService } from '../ledger/index.js';
import { buildVoucher, getPostingRule } from '../ledger/posting-rule.js';

/**
 * Perpetual inventory — the bridge from a stock movement to the General Ledger.
 *
 * Every document that moves stock also moves money: receiving ₹25,000 of goods makes
 * Stock In Hand ₹25,000 larger, and something else has to give. Which accounts those
 * are is config (seed-data/base/posting-rules), not code, exactly as it is for
 * invoices — the only thing special about stock is where the AMOUNT comes from.
 *
 * A document can't tell you what a movement was worth. A Material Issue of 120 KG has
 * no rate on it; its value is whatever the moving average happened to be when it
 * posted. So the stock ledger works the value out, and it is handed to the posting
 * rule as `stockValue` rather than read off a field.
 *
 * `stockValue` is the ABSOLUTE net value change. Direction lives in the rule (an
 * issue debits Stock Adjustment and credits Stock In Hand), which keeps the sign
 * convention in one readable place instead of split between config and code.
 */
export const stockGlService = {
  /**
   * Post the GL side of a stock document, on the document's own transaction so the
   * stock and the money commit together or not at all.
   *
   * No-ops when the document has no posting rule, or when the rule's matching case
   * has no lines — a warehouse-to-warehouse transfer moves no value, so it has a
   * stock entry and no accounting entry, which is correct rather than an omission.
   */
  async postMovement(
    doc: { slug: string; code: string; data: Record<string, unknown> },
    totalValueDifference: string,
    postingDate: Date | string,
    manager?: EntityManager,
  ): Promise<{ posted: boolean }> {
    const rule = getPostingRule(doc.slug);
    if (!rule) return { posted: false };

    const stockValue = Math.abs(Number(totalValueDifference));
    if (!stockValue) return { posted: false };

    const voucher = await buildVoucher(rule, { code: doc.code, data: doc.data }, postingDate, { stockValue });
    if (voucher.lines.length === 0) return { posted: false };

    await ledgerService.post(voucher, manager);
    return { posted: true };
  },
};

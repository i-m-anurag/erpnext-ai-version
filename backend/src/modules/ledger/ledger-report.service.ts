import { AppDataSource } from '../../db/data-source.js';

/** One line of a General Ledger report, with the running balance after this entry. */
export interface GlReportRow {
  postingDate: string;
  voucherType: string;
  voucherNo: string;
  party: string | null;
  against: string | null;
  debit: string;
  credit: string;
  /** Running Σ(debit − credit) up to and including this row. */
  balance: string;
}

/** One line of the Trial Balance — a leaf account's total debits and credits. */
export interface TrialBalanceRow {
  account: string;
  name: string;
  rootType: string;
  debit: string;
  credit: string;
}

/**
 * Read-side reports over the immutable `gl_entry`. All money stays as strings
 * (NUMERIC) end-to-end so nothing is rounded through a float.
 */
export class LedgerReportService {
  /** General Ledger for one account: every entry with a running balance. */
  async generalLedger(account: string): Promise<{ rows: GlReportRow[]; closing: string }> {
    const rows = (await AppDataSource.query(
      `SELECT posting_date, voucher_type, voucher_no, party, against, debit, credit,
              SUM(debit - credit) OVER (ORDER BY seq) AS balance
         FROM gl_entry
        WHERE account = $1
        ORDER BY seq`,
      [account],
    )) as Record<string, unknown>[];
    const mapped: GlReportRow[] = rows.map((r) => ({
      postingDate: String(r.posting_date),
      voucherType: String(r.voucher_type),
      voucherNo: String(r.voucher_no),
      party: (r.party as string) ?? null,
      against: (r.against as string) ?? null,
      debit: String(r.debit),
      credit: String(r.credit),
      balance: String(r.balance),
    }));
    return { rows: mapped, closing: mapped.length ? mapped[mapped.length - 1]!.balance : '0' };
  }

  /** Trial Balance: per-account debit/credit totals + the grand totals (which must match). */
  async trialBalance(): Promise<{ rows: TrialBalanceRow[]; totalDebit: string; totalCredit: string }> {
    const rows = (await AppDataSource.query(
      `SELECT g.account, a.name, a.root_type,
              SUM(g.debit) AS debit, SUM(g.credit) AS credit
         FROM gl_entry g
         JOIN account a ON a.code = g.account
        GROUP BY g.account, a.name, a.root_type
        ORDER BY a.root_type, g.account`,
    )) as Record<string, unknown>[];
    const totals = (await AppDataSource.query(
      `SELECT COALESCE(SUM(debit), 0) AS debit, COALESCE(SUM(credit), 0) AS credit FROM gl_entry`,
    )) as Record<string, unknown>[];
    return {
      rows: rows.map((r) => ({
        account: String(r.account),
        name: String(r.name),
        rootType: String(r.root_type),
        debit: String(r.debit),
        credit: String(r.credit),
      })),
      totalDebit: String(totals[0]!.debit),
      totalCredit: String(totals[0]!.credit),
    };
  }
}

export const ledgerReportService = new LedgerReportService();

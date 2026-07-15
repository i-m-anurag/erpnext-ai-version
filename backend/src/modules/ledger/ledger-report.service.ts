import { Decimal } from 'decimal.js';
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

/** One line of a financial statement (P&L / Balance Sheet). */
export interface StatementRow {
  account: string;
  name: string;
  amount: string;
}
export interface ProfitAndLoss {
  income: StatementRow[];
  totalIncome: string;
  expense: StatementRow[];
  totalExpense: string;
  netProfit: string;
}
export interface BalanceSheet {
  assets: StatementRow[];
  totalAssets: string;
  liabilities: StatementRow[];
  totalLiabilities: string;
  equity: StatementRow[];
  totalEquity: string;
  netProfit: string;
  totalLiabilitiesEquity: string;
  balanced: boolean;
}

/** One party's outstanding balance in an AR/AP report. */
export interface PartyOutstandingRow {
  party: string;
  outstanding: string;
}

/** One party's outstanding split into ageing buckets (FIFO — payments clear oldest first). */
export interface AgeingRow {
  party: string;
  current: string;
  days30: string;
  days60: string;
  days90Plus: string;
  total: string;
}

interface AccountNet {
  code: string;
  name: string;
  rootType: string;
  debit: Decimal;
  credit: Decimal;
}

/**
 * Read-side reports over the immutable `gl_entry`. All money stays as strings
 * (NUMERIC) end-to-end so nothing is rounded through a float.
 */
export class LedgerReportService {
  /**
   * General Ledger for one account, optionally within [from, to]. `opening` is the
   * balance of all entries before `from`; each row's running balance continues from
   * it. Running balance is computed in JS with decimal.js (exact).
   */
  async generalLedger(
    account: string,
    from?: string,
    to?: string,
  ): Promise<{ rows: GlReportRow[]; opening: string; closing: string }> {
    let opening = new Decimal(0);
    if (from) {
      const o = (await AppDataSource.query(
        `SELECT COALESCE(SUM(debit - credit), 0) AS bal FROM gl_entry WHERE account = $1 AND posting_date < $2`,
        [account, from],
      )) as Record<string, unknown>[];
      opening = new Decimal(String(o[0]!.bal));
    }

    const conds = ['account = $1'];
    const params: unknown[] = [account];
    if (from) { params.push(from); conds.push(`posting_date >= $${params.length}`); }
    if (to) { params.push(to); conds.push(`posting_date <= $${params.length}`); }

    const rows = (await AppDataSource.query(
      `SELECT posting_date, voucher_type, voucher_no, party, against, debit, credit
         FROM gl_entry WHERE ${conds.join(' AND ')} ORDER BY seq`,
      params,
    )) as Record<string, unknown>[];

    let bal = opening;
    const mapped: GlReportRow[] = rows.map((r) => {
      bal = bal.plus(String(r.debit)).minus(String(r.credit));
      return {
        postingDate: String(r.posting_date),
        voucherType: String(r.voucher_type),
        voucherNo: String(r.voucher_no),
        party: (r.party as string) ?? null,
        against: (r.against as string) ?? null,
        debit: String(r.debit),
        credit: String(r.credit),
        balance: bal.toFixed(6),
      };
    });
    return { rows: mapped, opening: opening.toFixed(6), closing: bal.toFixed(6) };
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

  /**
   * Party-wise outstanding for an account role. Payable (creditors) outstanding =
   * credit − debit (we owe); Receivable (debtors) = debit − credit (owed to us).
   * Parties netting to zero are dropped.
   */
  async partyOutstanding(accountType: 'Payable' | 'Receivable'): Promise<PartyOutstandingRow[]> {
    const sign = accountType === 'Payable' ? '(SUM(g.credit) - SUM(g.debit))' : '(SUM(g.debit) - SUM(g.credit))';
    const rows = (await AppDataSource.query(
      `SELECT g.party, ${sign} AS outstanding
         FROM gl_entry g JOIN account a ON a.code = g.account
        WHERE a.account_type = $1 AND g.party IS NOT NULL
        GROUP BY g.party
       HAVING ${sign} <> 0
        ORDER BY g.party`,
      [accountType],
    )) as Record<string, unknown>[];
    return rows.map((r) => ({ party: String(r.party), outstanding: String(r.outstanding) }));
  }

  /**
   * Party-wise ageing. Invoices (the balance-increasing side) are aged by their
   * posting date; payments (the reducing side) are applied FIFO to the oldest
   * invoices first, and each invoice's *remaining* amount lands in a bucket by age.
   */
  async partyAgeing(accountType: 'Payable' | 'Receivable'): Promise<AgeingRow[]> {
    // For Payable, invoices are credits and payments debits; reversed for Receivable.
    const rows = (await AppDataSource.query(
      `SELECT g.party, g.posting_date, g.debit, g.credit
         FROM gl_entry g JOIN account a ON a.code = g.account
        WHERE a.account_type = $1 AND g.party IS NOT NULL
        ORDER BY g.party, g.posting_date, g.seq`,
      [accountType],
    )) as Record<string, unknown>[];

    const invAmt = (r: Record<string, unknown>): Decimal =>
      accountType === 'Payable' ? new Decimal(String(r.credit)) : new Decimal(String(r.debit));
    const payAmt = (r: Record<string, unknown>): Decimal =>
      accountType === 'Payable' ? new Decimal(String(r.debit)) : new Decimal(String(r.credit));

    const now = Date.now();
    const ageDays = (d: unknown): number => Math.floor((now - new Date(String(d)).getTime()) / 86_400_000);

    // Group entries by party (already ordered by date).
    const byParty = new Map<string, Record<string, unknown>[]>();
    for (const r of rows) {
      const p = String(r.party);
      (byParty.get(p) ?? byParty.set(p, []).get(p)!).push(r);
    }

    const out: AgeingRow[] = [];
    for (const [party, entries] of byParty) {
      const invoices = entries.filter((e) => invAmt(e).gt(0)).map((e) => ({ date: e.posting_date, remaining: invAmt(e) }));
      let pool = entries.reduce((s, e) => s.plus(payAmt(e)), new Decimal(0));
      // Apply payments FIFO to the oldest invoices.
      for (const inv of invoices) {
        const applied = Decimal.min(inv.remaining, pool);
        inv.remaining = inv.remaining.minus(applied);
        pool = pool.minus(applied);
      }
      const b = { current: new Decimal(0), days30: new Decimal(0), days60: new Decimal(0), days90: new Decimal(0) };
      for (const inv of invoices) {
        if (inv.remaining.lte(0)) continue;
        const age = ageDays(inv.date);
        if (age <= 30) b.current = b.current.plus(inv.remaining);
        else if (age <= 60) b.days30 = b.days30.plus(inv.remaining);
        else if (age <= 90) b.days60 = b.days60.plus(inv.remaining);
        else b.days90 = b.days90.plus(inv.remaining);
      }
      const total = b.current.plus(b.days30).plus(b.days60).plus(b.days90);
      if (total.isZero()) continue;
      out.push({
        party,
        current: b.current.toFixed(2), days30: b.days30.toFixed(2), days60: b.days60.toFixed(2),
        days90Plus: b.days90.toFixed(2), total: total.toFixed(2),
      });
    }
    return out.sort((a, b) => a.party.localeCompare(b.party));
  }

  /** Per-account debit/credit totals, optionally within a date range and/or excluding
   *  year-end closing vouchers. */
  private async accountNets(opts: { from?: string; to?: string; excludeClosing?: boolean } = {}): Promise<AccountNet[]> {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (opts.excludeClosing) conds.push(`g.voucher_type <> 'period-closing'`);
    if (opts.from) { params.push(opts.from); conds.push(`g.posting_date::date >= $${params.length}`); }
    if (opts.to) { params.push(opts.to); conds.push(`g.posting_date::date <= $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = (await AppDataSource.query(
      `SELECT a.code, a.name, a.root_type, SUM(g.debit) AS debit, SUM(g.credit) AS credit
         FROM account a JOIN gl_entry g ON g.account = a.code ${where}
        GROUP BY a.code, a.name, a.root_type
        ORDER BY a.code`,
      params,
    )) as Record<string, unknown>[];
    return rows.map((r) => ({
      code: String(r.code), name: String(r.name), rootType: String(r.root_type),
      debit: new Decimal(String(r.debit)), credit: new Decimal(String(r.credit)),
    }));
  }

  /** The day after a date (for an exclusive "after the close" lower bound). */
  private nextDay(d: string): string {
    const dt = new Date(`${d}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  }

  /** Profit & Loss over [from,to] (all-time if omitted). Excludes year-end closing
   *  vouchers so a closed year still shows its real income/expense. */
  async profitAndLoss(from?: string, to?: string): Promise<ProfitAndLoss> {
    const nets = await this.accountNets({ from, to, excludeClosing: true });
    const income = nets.filter((n) => n.rootType === 'Income').map((n) => ({ account: n.code, name: n.name, amount: n.credit.minus(n.debit) }));
    const expense = nets.filter((n) => n.rootType === 'Expense').map((n) => ({ account: n.code, name: n.name, amount: n.debit.minus(n.credit) }));
    const sum = (rows: { amount: Decimal }[]): Decimal => rows.reduce((s, r) => s.plus(r.amount), new Decimal(0));
    const totalIncome = sum(income);
    const totalExpense = sum(expense);
    return {
      income: income.map((r) => ({ account: r.account, name: r.name, amount: r.amount.toFixed(2) })),
      totalIncome: totalIncome.toFixed(2),
      expense: expense.map((r) => ({ account: r.account, name: r.name, amount: r.amount.toFixed(2) })),
      totalExpense: totalExpense.toFixed(2),
      netProfit: totalIncome.minus(totalExpense).toFixed(2),
    };
  }

  /**
   * Balance Sheet as of now. Assets/Liabilities/Equity are the cumulative ledger
   * balances (so Retained Earnings already holds any closed-year profits via the
   * closing vouchers). The "Net Profit (Current Period)" line is the P&L of the OPEN
   * period only — everything after the last closed year — so closed profit isn't
   * double-counted.
   */
  async balanceSheet(lastCloseDate?: string | null): Promise<BalanceSheet> {
    const nets = await this.accountNets();
    const assets = nets.filter((n) => n.rootType === 'Asset').map((n) => ({ account: n.code, name: n.name, amount: n.debit.minus(n.credit) }));
    const liabilities = nets.filter((n) => n.rootType === 'Liability').map((n) => ({ account: n.code, name: n.name, amount: n.credit.minus(n.debit) }));
    const equityAccts = nets.filter((n) => n.rootType === 'Equity').map((n) => ({ account: n.code, name: n.name, amount: n.credit.minus(n.debit) }));

    const openFrom = lastCloseDate ? this.nextDay(lastCloseDate) : undefined;
    const pl = await this.profitAndLoss(openFrom);
    const netProfit = new Decimal(pl.netProfit);
    const equity = [...equityAccts, { account: 'net-profit', name: 'Net Profit (Current Period)', amount: netProfit }];

    const sum = (rows: { amount: Decimal }[]): Decimal => rows.reduce((s, r) => s.plus(r.amount), new Decimal(0));
    const totalAssets = sum(assets);
    const totalLiabilities = sum(liabilities);
    const totalEquity = sum(equity);
    const totalLiabEquity = totalLiabilities.plus(totalEquity);
    const str = (rows: { account: string; name: string; amount: Decimal }[]): StatementRow[] =>
      rows.map((r) => ({ account: r.account, name: r.name, amount: r.amount.toFixed(2) }));

    return {
      assets: str(assets), totalAssets: totalAssets.toFixed(2),
      liabilities: str(liabilities), totalLiabilities: totalLiabilities.toFixed(2),
      equity: str(equity), totalEquity: totalEquity.toFixed(2),
      netProfit: netProfit.toFixed(2),
      totalLiabilitiesEquity: totalLiabEquity.toFixed(2),
      balanced: totalAssets.equals(totalLiabEquity),
    };
  }
}

export const ledgerReportService = new LedgerReportService();

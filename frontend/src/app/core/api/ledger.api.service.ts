import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

export interface GlReportRow {
  postingDate: string;
  voucherType: string;
  voucherNo: string;
  party: string | null;
  against: string | null;
  debit: string;
  credit: string;
  balance: string;
}
export interface GeneralLedger {
  rows: GlReportRow[];
  closing: string;
}

export interface TrialBalanceRow {
  account: string;
  name: string;
  rootType: string;
  debit: string;
  credit: string;
}
export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: string;
  totalCredit: string;
}

/** Financial-ledger report reads. */
@Injectable({ providedIn: 'root' })
export class LedgerApiService {
  private readonly http = inject(HttpClient);

  generalLedger(account: string): Observable<GeneralLedger> {
    return this.http.get<GeneralLedger>(`/api/ledger/general-ledger?account=${encodeURIComponent(account)}`);
  }

  trialBalance(): Observable<TrialBalance> {
    return this.http.get<TrialBalance>('/api/ledger/trial-balance');
  }

  profitAndLoss(): Observable<ProfitAndLoss> {
    return this.http.get<ProfitAndLoss>('/api/ledger/profit-and-loss');
  }

  balanceSheet(): Observable<BalanceSheet> {
    return this.http.get<BalanceSheet>('/api/ledger/balance-sheet');
  }

  payables(): Observable<PartyOutstandingRow[]> {
    return this.http.get<{ rows: PartyOutstandingRow[] }>('/api/ledger/payables').pipe(map((r) => r.rows));
  }

  receivables(): Observable<PartyOutstandingRow[]> {
    return this.http.get<{ rows: PartyOutstandingRow[] }>('/api/ledger/receivables').pipe(map((r) => r.rows));
  }

  /** The GL entries a document posted (for the record's Accounting Entries panel). */
  voucherEntries(voucherType: string, voucherNo: string): Observable<GlVoucherEntry[]> {
    return this.http
      .get<{ entries: GlVoucherEntry[] }>(`/api/ledger/voucher/${encodeURIComponent(voucherType)}/${encodeURIComponent(voucherNo)}`)
      .pipe(map((r) => r.entries));
  }
}

/** One posted GL line as returned for a voucher. */
export interface GlVoucherEntry {
  account: string;
  debit: string;
  credit: string;
  party: string | null;
  against: string | null;
}

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
export interface PartyOutstandingRow {
  party: string;
  outstanding: string;
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

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

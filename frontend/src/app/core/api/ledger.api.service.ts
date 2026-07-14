import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { type Observable } from 'rxjs';

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
}

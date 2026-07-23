import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

export interface StockBalanceRow {
  itemCode: string;
  warehouse: string;
  qty: string;
  valuationRate: string;
  stockValue: string;
}

export interface StockLedgerRow {
  postingDate: string;
  itemCode: string;
  warehouse: string;
  actualQty: string;
  incomingRate: string | null;
  outgoingRate: string | null;
  qtyAfterTransaction: string;
  valuationRate: string;
  stockValue: string;
  stockValueDifference: string;
  voucherType: string;
  voucherNo: string;
}

/** Stock ledger reads — on-hand balances and movement history. */
@Injectable({ providedIn: 'root' })
export class StockApiService {
  private readonly http = inject(HttpClient);

  balances(): Observable<{ rows: StockBalanceRow[]; totalValue: string }> {
    return this.http.get<{ rows: StockBalanceRow[]; totalValue: string }>('/api/stock/balance');
  }

  ledger(item?: string, warehouse?: string): Observable<StockLedgerRow[]> {
    const qs = [item ? `item=${encodeURIComponent(item)}` : '', warehouse ? `warehouse=${encodeURIComponent(warehouse)}` : '']
      .filter(Boolean)
      .join('&');
    return this.http
      .get<{ rows: StockLedgerRow[] }>(`/api/stock/ledger${qs ? '?' + qs : ''}`)
      .pipe(map((r) => r.rows));
  }

  /** The movements one document produced (record "Stock Entries" panel). */
  voucherEntries(voucherType: string, voucherNo: string): Observable<StockLedgerRow[]> {
    return this.http
      .get<{ entries: StockLedgerRow[] }>(
        `/api/stock/voucher/${encodeURIComponent(voucherType)}/${encodeURIComponent(voucherNo)}`,
      )
      .pipe(map((r) => r.entries));
  }
}

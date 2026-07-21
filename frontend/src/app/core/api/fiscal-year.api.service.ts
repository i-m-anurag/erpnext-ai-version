import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

export interface FiscalYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isDefault: boolean;
  closed: boolean;
}

/** Fiscal years + year-end closing. */
@Injectable({ providedIn: 'root' })
export class FiscalYearApiService {
  private readonly http = inject(HttpClient);

  list(): Observable<FiscalYear[]> {
    return this.http.get<{ fiscalYears: FiscalYear[] }>('/api/ledger/fiscal-years').pipe(map((r) => r.fiscalYears));
  }

  close(id: string): Observable<{ closed: boolean; netProfit: string; voucher: string }> {
    return this.http.post<{ closed: boolean; netProfit: string; voucher: string }>(`/api/ledger/fiscal-years/${id}/close`, {});
  }
}

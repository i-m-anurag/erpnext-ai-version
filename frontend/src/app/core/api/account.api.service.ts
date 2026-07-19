import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

export type RootType = 'Asset' | 'Liability' | 'Income' | 'Expense' | 'Equity';

/** A node in the Chart of Accounts tree. */
export interface AccountNode {
  code: string;
  name: string;
  parentCode: string | null;
  rootType: RootType;
  accountType: string | null;
  isGroup: boolean;
  children: AccountNode[];
}

/** Read-only Chart of Accounts API. */
@Injectable({ providedIn: 'root' })
export class AccountApiService {
  private readonly http = inject(HttpClient);

  tree(): Observable<AccountNode[]> {
    return this.http.get<{ tree: AccountNode[] }>('/api/accounts/tree').pipe(map((r) => r.tree));
  }

  /** Flat list of accounts (used for the ledger account picker; filter isGroup for leaves). */
  list(): Observable<Account[]> {
    return this.http.get<{ accounts: Account[] }>('/api/accounts').pipe(map((r) => r.accounts));
  }

  /** Leaf accounts as picker options (value = code, label = "code — name") — feeds the
   *  account-lookup form field (e.g. Journal Entry lines). */
  options(): Observable<{ value: string; label: string }[]> {
    return this.http
      .get<{ options: { value: string; label: string }[] }>('/api/accounts/options')
      .pipe(map((r) => r.options));
  }
}

/** A flat account row. */
export interface Account {
  code: string;
  name: string;
  rootType: RootType;
  accountType: string | null;
  isGroup: boolean;
}

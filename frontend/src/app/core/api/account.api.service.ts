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
}

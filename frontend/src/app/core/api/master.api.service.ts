import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import type { MasterOption, MasterRegistry, MasterRow } from '../models/api.models';

/** Master registry + generic master-data access. */
@Injectable({ providedIn: 'root' })
export class MasterApiService {
  private readonly http = inject(HttpClient);

  listMasters(): Observable<MasterRegistry[]> {
    return this.http.get<{ masters: MasterRegistry[] }>('/api/masters').pipe(map((r) => r.masters));
  }

  getMaster(slug: string): Observable<MasterRegistry> {
    return this.http.get<{ master: MasterRegistry }>(`/api/masters/${slug}`).pipe(map((r) => r.master));
  }

  listData(slug: string): Observable<MasterRow[]> {
    return this.http.get<{ rows: MasterRow[] }>(`/api/masters/${slug}/data`).pipe(map((r) => r.rows));
  }

  getOptions(slug: string): Observable<MasterOption[]> {
    return this.http.get<{ options: MasterOption[] }>(`/api/masters/${slug}/options`).pipe(map((r) => r.options));
  }

  createData(slug: string, data: Record<string, unknown>): Observable<MasterRow> {
    return this.http.post<{ row: MasterRow }>(`/api/masters/${slug}/data`, data).pipe(map((r) => r.row));
  }

  updateData(slug: string, id: string, data: Record<string, unknown>): Observable<MasterRow> {
    return this.http.put<{ row: MasterRow }>(`/api/masters/${slug}/data/${id}`, data).pipe(map((r) => r.row));
  }

  deleteData(slug: string, id: string): Observable<void> {
    return this.http.delete<{ ok: boolean }>(`/api/masters/${slug}/data/${id}`).pipe(map(() => undefined));
  }
}

import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

export interface NamingSeries {
  slug: string;
  pattern: string;
  reset: 'never' | 'yearly' | 'monthly';
  resolvedFrom?: string;
}

/** CRUD over naming-series (auto-id) configs. Writes the custom scope. */
@Injectable({ providedIn: 'root' })
export class NamingApiService {
  private readonly http = inject(HttpClient);

  list(): Observable<NamingSeries[]> {
    return this.http.get<{ series: NamingSeries[] }>('/api/naming-series').pipe(map((r) => r.series));
  }
  get(slug: string): Observable<NamingSeries> {
    return this.http.get<{ series: NamingSeries }>(`/api/naming-series/${slug}`).pipe(map((r) => r.series));
  }
  save(slug: string, body: Partial<NamingSeries>): Observable<NamingSeries> {
    return this.http.put<{ series: NamingSeries }>(`/api/naming-series/${slug}`, body).pipe(map((r) => r.series));
  }
  reset(slug: string): Observable<void> {
    return this.http.delete<{ ok: boolean }>(`/api/naming-series/${slug}`).pipe(map(() => undefined));
  }
}

import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

export interface RelatedDoc {
  master: string;
  code: string;
  relation: string;
  direction: 'up' | 'down';
}
export interface CreateOption {
  to: string;
  label: string;
  relation: string;
}

/** Document chaining: lineage (related docs) + create-next-document. */
@Injectable({ providedIn: 'root' })
export class DocumentApiService {
  private readonly http = inject(HttpClient);

  links(master: string, code: string): Observable<{ related: RelatedDoc[]; createOptions: CreateOption[] }> {
    return this.http.get<{ related: RelatedDoc[]; createOptions: CreateOption[] }>(
      `/api/documents/${master}/${encodeURIComponent(code)}/links`,
    );
  }

  createNext(master: string, code: string, toMaster: string): Observable<{ master: string; code: string }> {
    return this.http
      .post<{ created: { master: string; code: string } }>(
        `/api/documents/${master}/${encodeURIComponent(code)}/create-next`,
        { toMaster },
      )
      .pipe(map((r) => r.created));
  }
}

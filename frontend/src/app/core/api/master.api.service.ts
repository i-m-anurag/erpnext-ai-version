import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import type { MasterOption } from '../models/api.models';

/** Reads master dropdown options (for master-lookup form fields). */
@Injectable({ providedIn: 'root' })
export class MasterApiService {
  private readonly http = inject(HttpClient);

  getOptions(slug: string): Observable<MasterOption[]> {
    return this.http
      .get<{ options: MasterOption[] }>(`/api/masters/${slug}/options`)
      .pipe(map((r) => r.options));
  }
}

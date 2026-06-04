import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';
import type { FormDefinition } from '../models/api.models';

/** Fetches resolved form definitions — public (pre-auth) or authed. */
@Injectable({ providedIn: 'root' })
export class FormApiService {
  private readonly http = inject(HttpClient);

  /** Public endpoint — only forms flagged public (e.g. login). No auth required. */
  getPublicForm(slug: string): Observable<FormDefinition> {
    return this.http.get<{ form: FormDefinition }>(`/api/public/forms/${slug}`).pipe(map((r) => r.form));
  }

  /** Authed endpoint — requires a session + form:view. */
  getForm(slug: string): Observable<FormDefinition> {
    return this.http.get<{ form: FormDefinition }>(`/api/forms/${slug}`).pipe(map((r) => r.form));
  }
}

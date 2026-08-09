import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

export interface EmailTemplate {
  slug: string;
  subject: string;
  html: string;
  text?: string;
  variables: string[];
  resolvedFrom?: string;
}
export interface TemplateSummary {
  slug: string;
  subject: string;
  variables: string[];
  resolvedFrom: string;
}
export interface RenderedTemplate {
  subject: string;
  html: string;
  text?: string;
}
export type TemplateVars = Record<string, string | number>;

/** UI CRUD over email templates (writes go to the custom scope). */
@Injectable({ providedIn: 'root' })
export class TemplateApiService {
  private readonly http = inject(HttpClient);

  list(): Observable<TemplateSummary[]> {
    return this.http.get<{ templates: TemplateSummary[] }>('/api/templates').pipe(map((r) => r.templates));
  }
  get(slug: string): Observable<EmailTemplate> {
    return this.http.get<{ template: EmailTemplate }>(`/api/templates/${slug}`).pipe(map((r) => r.template));
  }
  save(slug: string, body: Partial<EmailTemplate>): Observable<EmailTemplate> {
    return this.http.put<{ template: EmailTemplate }>(`/api/templates/${slug}`, body).pipe(map((r) => r.template));
  }
  reset(slug: string): Observable<void> {
    return this.http.delete<{ ok: boolean }>(`/api/templates/${slug}`).pipe(map(() => undefined));
  }
  /** Server-validated render (enforces the variable contract). Pass `template` to
   *  validate the editor's current, possibly unsaved, edits. */
  preview(slug: string, template?: Partial<EmailTemplate>, vars: TemplateVars = {}): Observable<RenderedTemplate> {
    return this.http.post<{ preview: RenderedTemplate }>(`/api/templates/${slug}/preview`, { template, vars }).pipe(map((r) => r.preview));
  }
  /** "Send test to me" — renders + logs the intent (dispatch deferred). */
  testSend(slug: string, to: string, template?: Partial<EmailTemplate>, vars: TemplateVars = {}): Observable<RenderedTemplate & { to: string }> {
    return this.http.post<{ result: RenderedTemplate & { to: string } }>(`/api/templates/${slug}/test-send`, { to, template, vars }).pipe(map((r) => r.result));
  }
}

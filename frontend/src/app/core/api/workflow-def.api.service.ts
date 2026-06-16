import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

export interface WorkflowStateDef {
  name: string;
  color?: string;
}
export interface WorkflowTransitionDef {
  action: string;
  from: string;
  to: string;
  roles?: string[];
  condition?: string | null;
}
export interface WorkflowDef {
  slug: string;
  appliesTo: string;
  startState: string;
  states: WorkflowStateDef[];
  transitions: WorkflowTransitionDef[];
  resolvedFrom?: string;
}
export interface WorkflowSummary {
  slug: string;
  appliesTo: string;
  states: number;
  transitions: number;
  resolvedFrom: string;
}

/** CRUD over workflow definitions (the configurator). Writes the custom scope. */
@Injectable({ providedIn: 'root' })
export class WorkflowDefApiService {
  private readonly http = inject(HttpClient);

  list(): Observable<WorkflowSummary[]> {
    return this.http.get<{ workflows: WorkflowSummary[] }>('/api/workflow-defs').pipe(map((r) => r.workflows));
  }
  get(slug: string): Observable<WorkflowDef> {
    return this.http.get<{ workflow: WorkflowDef }>(`/api/workflow-defs/${slug}`).pipe(map((r) => r.workflow));
  }
  save(slug: string, def: WorkflowDef): Observable<WorkflowDef> {
    return this.http.put<{ workflow: WorkflowDef }>(`/api/workflow-defs/${slug}`, def).pipe(map((r) => r.workflow));
  }
  reset(slug: string): Observable<void> {
    return this.http.delete<{ ok: boolean }>(`/api/workflow-defs/${slug}`).pipe(map(() => undefined));
  }
}

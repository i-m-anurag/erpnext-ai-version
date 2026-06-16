import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

export interface WorkflowStateDef {
  name: string;
  color?: string;
}
export interface Condition {
  field: string;
  op: '==' | '!=' | '<' | '<=' | '>' | '>=';
  value: string | number | boolean | null;
}
export type RuleAction =
  | { type: 'set_state'; to: string }
  | { type: 'set_field'; field: string; value: string | number | boolean | null }
  | { type: 'email'; template: string; to: string[] }
  | { type: 'assign'; role?: string; users?: string[]; strategy?: 'least_loaded' | 'round_robin' };
export interface RuleBranch {
  conditions: Condition[];
  actions: RuleAction[];
}
export interface Rule {
  name: string;
  trigger: { on: 'action'; action: string; fromState?: string | null; roles: string[] };
  branches: RuleBranch[];
}
export interface WorkflowDef {
  slug: string;
  appliesTo: string;
  startState: string;
  states: WorkflowStateDef[];
  rules: Rule[];
  resolvedFrom?: string;
}
export interface WorkflowSummary {
  slug: string;
  appliesTo: string;
  states: number;
  rules: number;
  resolvedFrom: string;
}

/** CRUD over workflow definitions (the rule-engine configurator). Writes custom scope. */
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

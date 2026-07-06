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

/** One approver in a serial approval chain (a role, optionally branch-scoped, or a user). */
export interface ApprovalStep {
  approver: 'role' | 'user';
  role?: string;
  user?: string;
  branchScoped?: boolean;
}
/** A tier: the first tier whose `when` matches supplies the ordered approver steps.
 *  The UI authors `when` as a plain `doc.<field> <op> <number>` threshold (or none). */
export interface ApprovalRule {
  when?: Record<string, unknown>;
  steps: ApprovalStep[];
}
/** A serial approval chain attached to a triggering action (e.g. Submit). */
export interface ApprovalConfig {
  action: string;
  pendingState: string;
  onApproved: string;
  onRejected: string;
  rules: ApprovalRule[];
}

export interface WorkflowDef {
  slug: string;
  appliesTo: string;
  startState: string;
  states: WorkflowStateDef[];
  rules: Rule[];
  /** serial approval chains attached to actions (authored via the Approval Rules form). */
  approvals?: ApprovalConfig[];
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

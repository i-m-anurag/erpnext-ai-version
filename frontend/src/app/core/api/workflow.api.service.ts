import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { type Observable } from 'rxjs';

export interface WorkflowStateDef {
  name: string;
  color?: string;
}
export interface WorkflowAction {
  action: string;
  requiresAssignee: boolean;
  /** false when the action needs the assignee and this user isn't. */
  enabled: boolean;
}
export interface WorkflowStatus {
  hasWorkflow: boolean;
  currentState: string | null;
  states: WorkflowStateDef[];
  actions: WorkflowAction[];
  /** the field form may be edited / saved (only in the start state). */
  editable: boolean;
  /** cross-document "Create next" is allowed in the current state. */
  canCreateNext: boolean;
  /** this user is the record's current open assignee. */
  isAssignee: boolean;
}
export interface TransitionResult {
  from: string;
  to: string;
  action: string;
  stateChanged: boolean;
}

/** Workflow state + transitions for a record (keyed by master slug + natural code). */
@Injectable({ providedIn: 'root' })
export class WorkflowApiService {
  private readonly http = inject(HttpClient);

  status(masterSlug: string, recordId: string): Observable<WorkflowStatus> {
    return this.http.get<WorkflowStatus>(`/api/workflow/${masterSlug}/${encodeURIComponent(recordId)}/status`);
  }

  transition(masterSlug: string, recordId: string, action: string): Observable<TransitionResult> {
    return this.http.post<TransitionResult>(
      `/api/workflow/${masterSlug}/${encodeURIComponent(recordId)}/transition`,
      { action },
    );
  }
}

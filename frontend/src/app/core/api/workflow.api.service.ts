import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { type Observable } from 'rxjs';

export interface WorkflowStateDef {
  name: string;
  color?: string;
}
export interface WorkflowStatus {
  hasWorkflow: boolean;
  currentState: string | null;
  states: WorkflowStateDef[];
  actions: { action: string }[];
  /** the field form is read-only in the current state (editableStates / formReadOnly) */
  formReadOnly: boolean;
  /** convenience inverse of formReadOnly */
  editable: boolean;
  /** the current state's allowed action names, or null when unrestricted */
  allow: string[] | null;
  /** the caller is the record's current open assignee */
  isAssignee: boolean;
  /** the record's current open assignee (for an "Assigned to …" hint) */
  activeAssignee: { id: string; name: string } | null;
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

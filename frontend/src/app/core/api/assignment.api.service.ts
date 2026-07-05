import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

/** A workflow assignment (as returned by the backend, user ids resolved to names). */
export interface Assignment {
  id: string;
  entityType: string;
  recordId: string;
  assigneeUserId: string;
  assigneeName: string;
  role: string | null;
  state: string | null;
  status: 'open' | 'closed';
  ruleName: string | null;
  assignedByUserId: string | null;
  assignedByName: string | null;
  createdAt: string;
  closedAt: string | null;
}

/** Worklist + per-record assignment history + reassign. */
@Injectable({ providedIn: 'root' })
export class AssignmentApiService {
  private readonly http = inject(HttpClient);

  /** My worklist. status: 'open' (default) | 'closed' | 'all'. */
  mine(status: 'open' | 'closed' | 'all' = 'open'): Observable<Assignment[]> {
    return this.http
      .get<{ assignments: Assignment[] }>(`/api/assignments/mine?status=${status}`)
      .pipe(map((r) => r.assignments));
  }

  /** Assignment history for one record. */
  forRecord(master: string, code: string): Observable<Assignment[]> {
    return this.http
      .get<{ assignments: Assignment[] }>(`/api/assignments/${master}/${encodeURIComponent(code)}`)
      .pipe(map((r) => r.assignments));
  }

  reassign(id: string, toUserId: string): Observable<Assignment> {
    return this.http
      .post<{ assignment: Assignment }>(`/api/assignments/${id}/reassign`, { toUserId })
      .pipe(map((r) => r.assignment));
  }
}

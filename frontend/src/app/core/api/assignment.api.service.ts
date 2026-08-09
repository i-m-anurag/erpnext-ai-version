import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

/** An assignment row as returned by the API (matches the backend AssignmentView). */
export interface Assignment {
  id: string;
  entityType: string;
  recordId: string;
  assigneeUserId: string;
  assigneeName: string;
  status: 'open' | 'closed';
  role: string | null;
  state: string | null;
  ruleName: string | null;
  assignedByUserId: string | null;
  assignedByName: string | null;
  createdAt: string;
  closedAt: string | null;
  dueAt: string | null;
}

/** Assignment worklist + record history + reassign. */
@Injectable({ providedIn: 'root' })
export class AssignmentApiService {
  private readonly http = inject(HttpClient);

  /** The current user's worklist (their open tasks by default). */
  mine(status: 'open' | 'closed' = 'open'): Observable<Assignment[]> {
    const params = new HttpParams().set('status', status);
    return this.http
      .get<{ assignments: Assignment[] }>('/api/assignments/mine', { params })
      .pipe(map((r) => r.assignments));
  }

  /** A record's full assignment history. */
  forRecord(masterSlug: string, recordId: string): Observable<Assignment[]> {
    return this.http
      .get<{ assignments: Assignment[] }>(`/api/assignments/${masterSlug}/${encodeURIComponent(recordId)}`)
      .pipe(map((r) => r.assignments));
  }

  /** Reassign an open assignment to another user (closes the old, opens a new). */
  reassign(id: string, toUserId: string): Observable<{ assignment: Assignment }> {
    return this.http.post<{ assignment: Assignment }>(`/api/assignments/${id}/reassign`, { toUserId });
  }
}

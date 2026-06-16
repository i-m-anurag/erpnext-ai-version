import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

export type TimelineKind = 'created' | 'updated' | 'state_changed' | 'assigned' | 'commented' | 'email_sent';

export interface Actor {
  id: string;
  name: string;
}
export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  summary: string;
  data: Record<string, unknown> | null;
  actor: Actor | null;
  createdAt: string;
}
export interface RecordComment {
  id: string;
  body: string;
  author: Actor;
  createdAt: string;
}

/** Timeline + comments for a record, keyed by (entityType, recordId=natural code). */
@Injectable({ providedIn: 'root' })
export class ActivityApiService {
  private readonly http = inject(HttpClient);

  timeline(entityType: string, recordId: string): Observable<TimelineEntry[]> {
    return this.http
      .get<{ timeline: TimelineEntry[] }>(`/api/activity/${entityType}/${encodeURIComponent(recordId)}/timeline`)
      .pipe(map((r) => r.timeline));
  }

  comments(entityType: string, recordId: string): Observable<RecordComment[]> {
    return this.http
      .get<{ comments: RecordComment[] }>(`/api/activity/${entityType}/${encodeURIComponent(recordId)}/comments`)
      .pipe(map((r) => r.comments));
  }

  addComment(entityType: string, recordId: string, body: string): Observable<RecordComment> {
    return this.http
      .post<{ comment: RecordComment }>(`/api/activity/${entityType}/${encodeURIComponent(recordId)}/comments`, { body })
      .pipe(map((r) => r.comment));
  }
}

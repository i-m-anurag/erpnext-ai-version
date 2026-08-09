import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

/** An in-app notification (matches the backend Notification entity). */
export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  entityType: string | null;
  recordId: string | null;
  createdAt: string;
}

/** In-app notification feed (the bell). Self-scoped to the signed-in user. */
@Injectable({ providedIn: 'root' })
export class NotificationApiService {
  private readonly http = inject(HttpClient);

  mine(unreadOnly = false): Observable<AppNotification[]> {
    const params = new HttpParams().set('unread', String(unreadOnly));
    return this.http
      .get<{ notifications: AppNotification[] }>('/api/notifications/mine', { params })
      .pipe(map((r) => r.notifications));
  }

  unreadCount(): Observable<number> {
    return this.http.get<{ unread: number }>('/api/notifications/mine/count').pipe(map((r) => r.unread));
  }

  markRead(id: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`/api/notifications/${id}/read`, {});
  }

  markAllRead(): Observable<{ ok: boolean; marked: number }> {
    return this.http.post<{ ok: boolean; marked: number }>('/api/notifications/read-all', {});
  }
}

import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';

export interface StatData { value: number; delta?: number }
export interface SeriesPoint { label: string; value: number }
export interface SeriesData { points: SeriesPoint[] }
export interface TableData { columns: string[]; rows: Record<string, unknown>[] }

export interface DashboardWidget {
  type: 'stat' | 'chart' | 'table';
  title: string;
  span: number;
  chart?: 'bar' | 'line' | 'pie';
  data: StatData | SeriesData | TableData | null;
  error?: string;
}

export interface ResolvedDashboard {
  slug: string;
  widgets: DashboardWidget[];
}

/** Reads a module's resolved dashboard (widget config + metric data) in one call. */
@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly http = inject(HttpClient);

  forModule(module: string): Observable<ResolvedDashboard> {
    return this.http.get<ResolvedDashboard>(`/api/dashboards/${encodeURIComponent(module)}`);
  }
}

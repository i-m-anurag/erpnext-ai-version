import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import type { Observable } from 'rxjs';

export interface StatData { value: number; delta?: number; spark?: number[] }
export interface SeriesPoint { label: string; value: number }
export interface SeriesData { points: SeriesPoint[] }
export interface TableData { columns: string[]; rows: Record<string, unknown>[] }

export interface DashboardWidget {
  type: 'stat' | 'chart' | 'table';
  title: string;
  span: number;
  chart?: 'bar' | 'line' | 'pie';
  icon?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'info';
  /** The metric's target master, echoed back so a stat card can drill into its list. */
  source?: { master?: string };
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

  /** `from` is an optional YYYY-MM-DD "since" bound for the date-range filter. */
  forModule(module: string, from?: string): Observable<ResolvedDashboard> {
    const params = from ? new HttpParams().set('from', from) : undefined;
    return this.http.get<ResolvedDashboard>(`/api/dashboards/${encodeURIComponent(module)}`, { params });
  }
}

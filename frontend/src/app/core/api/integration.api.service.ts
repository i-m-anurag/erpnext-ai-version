import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import type { Observable } from 'rxjs';

/** Per-form integration config (drives which affordances appear). */
export interface IntegrationConfig {
  slug: string;
  collatioUpload?: { enabled: boolean; docType: string };
  threeWayMatch?: { enabled: boolean };
}

/** The four documents a three-way match reconciles. */
export interface MatchRefs {
  invoice: string;
  materialRequest: string;
  purchaseOrder: string;
  purchaseReceipt: string;
}

export interface CollatioUploadResult {
  code: string;
  collatioDocId: string;
  transactionId: string;
  filePath: string;
}

export interface ThreeWayMatchLine {
  line: string;
  description: string;
  po_qty: number;
  gr_qty: number;
  inv_qty: number;
  qty_match: boolean;
  po_price: number;
  inv_price: number;
  variance: number;
  price_match: boolean;
  po_total: number;
  inv_total: number;
  result: string;
}

export interface ThreeWayMatchResult {
  header: {
    invoice_no: string;
    bill_no: string;
    match_date: string;
    po_no: string;
    gr_no: string;
    ap_analyst: string;
    supplier: string;
    overall_result: string;
    approved: boolean;
  };
  lines: ThreeWayMatchLine[];
  totals: { po_total: number; inv_total: number; match: boolean };
  tolerances: { control: string; setting: string; result: string; status: string; ok: boolean }[];
  checks: { control: string; detail: string; result: string; status: string; ok: boolean }[];
  currency: string;
  outstanding: number;
  next_action: string;
}

export interface ApiCallLog {
  id: string;
  createdAt: string;
  provider: string;
  operation: string;
  method: string;
  url: string;
  reqContentType: string | null;
  reqHeaders: Record<string, unknown> | null;
  reqBody: string | null;
  respStatus: number | null;
  respBody: string | null;
  ok: boolean;
  durationMs: number;
  errorMessage: string | null;
  mock: boolean;
  correlationId: string | null;
  entityType: string | null;
  entityId: string | null;
}

/**
 * Client for the ERP's third-party integration endpoints (Collatio flows + the
 * outbound-API audit log). Dedicated service — Collatio/integration concerns live
 * here, not folded into an unrelated service.
 */
@Injectable({ providedIn: 'root' })
export class IntegrationApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/integrations';

  configFor(slug: string): Observable<IntegrationConfig> {
    return this.http.get<IntegrationConfig>(`${this.base}/config/${encodeURIComponent(slug)}`);
  }

  /** Upload a document to Collatio, creating a linked draft record of `slug`. */
  collatioUpload(slug: string, file: File): Observable<CollatioUploadResult> {
    const form = new FormData();
    form.append('slug', slug);
    form.append('file', file, file.name);
    return this.http.post<CollatioUploadResult>(`${this.base}/collatio/upload`, form);
  }

  /** Suggested doc numbers (from links + invoice fields) to pre-fill the match dialog. */
  threeWayMatchRefs(invoice: string): Observable<MatchRefs> {
    return this.http.get<MatchRefs>(`${this.base}/collatio/three-way-match/refs/${encodeURIComponent(invoice)}`);
  }

  /** Run the match with the four confirmed document numbers. */
  threeWayMatch(refs: MatchRefs): Observable<ThreeWayMatchResult> {
    return this.http.post<ThreeWayMatchResult>(`${this.base}/collatio/three-way-match`, refs);
  }

  /** Fetch a record's uploaded document as a blob (auth header applied by the
   *  interceptor), so the caller can open it in a new tab via an object URL. */
  documentBlob(slug: string, code: string): Observable<Blob> {
    return this.http.get(`${this.base}/collatio/document/${encodeURIComponent(slug)}/${encodeURIComponent(code)}`, {
      responseType: 'blob',
    });
  }

  logs(provider?: string, limit = 100): Observable<ApiCallLog[]> {
    let params = new HttpParams().set('limit', String(limit));
    if (provider) params = params.set('provider', provider);
    return this.http.get<ApiCallLog[]>(`${this.base}/logs`, { params });
  }

  log(id: string): Observable<ApiCallLog> {
    return this.http.get<ApiCallLog>(`${this.base}/logs/${encodeURIComponent(id)}`);
  }
}

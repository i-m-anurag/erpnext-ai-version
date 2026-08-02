import axios, { type AxiosRequestConfig } from 'axios';
import { BaseRepository } from '../../shared/base.repository.js';
import { logger } from '../../config/logger.js';
import { ApiCallLog } from './api-call-log.entity.js';

/** Bodies larger than this (chars) are truncated before persisting. */
const BODY_CAP = 20_000;
/** Header names whose values must never be persisted. */
const SECRET_HEADERS = new Set(['authorization', 'x-api-key', 'api-key', 'cookie', 'proxy-authorization', 'set-cookie']);

/** Audit context attached to a call so a log row can be traced back to a record/user. */
export interface CallMeta {
  correlationId?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
}

export interface GatewayCall {
  provider: string;
  operation: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Absolute URL. */
  url: string;
  headers?: Record<string, string>;
  /** JSON-serialisable body, or a FormData for multipart. */
  data?: unknown;
  params?: Record<string, unknown>;
  responseType?: 'json' | 'text' | 'arraybuffer';
  timeoutMs?: number;
  /** For multipart/binary bodies: what to log instead of the raw stream. */
  bodySummary?: string;
  meta?: CallMeta;
}

/**
 * The single choke-point for every outbound third-party HTTP call. Wraps axios
 * and writes an {@link ApiCallLog} row for EVERY attempt — success, non-2xx, or
 * transport error — with secrets redacted and bodies capped. New integrations
 * should call `request()` here rather than importing axios directly, so nothing
 * leaves the ERP unlogged. `recordMock()` logs a canned (dev) response the same
 * way, so mocked and live calls appear together in the audit trail.
 */
export class HttpGatewayService {
  private readonly logs = new BaseRepository(ApiCallLog);

  async request<T = unknown>(call: GatewayCall): Promise<T> {
    const started = Date.now();
    const cfg: AxiosRequestConfig = {
      method: call.method,
      url: call.url,
      headers: call.headers,
      data: call.data,
      params: call.params,
      responseType: call.responseType ?? 'json',
      timeout: call.timeoutMs ?? 30_000,
      // Never throw on HTTP status; we inspect it ourselves so non-2xx is logged too.
      validateStatus: () => true,
    };

    let status: number | null = null;
    let respBody: string | null = null;
    let ok = false;
    let errorMessage: string | null = null;
    try {
      const res = await axios.request<T>(cfg);
      status = res.status;
      ok = res.status >= 200 && res.status < 300;
      respBody = this.cap(this.stringify(res.data));
      if (!ok) errorMessage = `HTTP ${res.status}`;
      this.persist(call, { status, respBody, ok, errorMessage, durationMs: Date.now() - started, mock: false });
      if (!ok) throw new Error(`${call.provider}.${call.operation} failed: HTTP ${res.status}`);
      return res.data;
    } catch (err) {
      // Transport-level failure (DNS/timeout/refused) — status stayed null.
      if (status === null) {
        errorMessage = err instanceof Error ? err.message : 'request failed';
        this.persist(call, { status, respBody, ok: false, errorMessage, durationMs: Date.now() - started, mock: false });
      }
      throw err;
    }
  }

  /** Log a mocked (dev) response as if it had been called, so the audit trail is complete. */
  recordMock(call: GatewayCall, response: unknown): void {
    this.persist(call, {
      status: 200,
      respBody: this.cap(this.stringify(response)),
      ok: true,
      errorMessage: null,
      durationMs: 0,
      mock: true,
    });
  }

  private persist(
    call: GatewayCall,
    r: { status: number | null; respBody: string | null; ok: boolean; errorMessage: string | null; durationMs: number; mock: boolean },
  ): void {
    const row = this.logs.create({
      provider: call.provider,
      operation: call.operation,
      method: call.method,
      url: call.url,
      reqContentType: call.headers?.['Content-Type'] ?? call.headers?.['content-type'] ?? null,
      reqHeaders: this.redact(call.headers),
      reqBody: call.bodySummary ?? (call.data === undefined ? null : this.cap(this.stringify(call.data))),
      respStatus: r.status,
      respBody: r.respBody,
      ok: r.ok,
      durationMs: r.durationMs,
      errorMessage: r.errorMessage,
      mock: r.mock,
      correlationId: call.meta?.correlationId ?? null,
      entityType: call.meta?.entityType ?? null,
      entityId: call.meta?.entityId ?? null,
      actorUserId: call.meta?.actorUserId ?? null,
    });
    // Logging must never break the actual call — swallow write failures.
    void this.logs.save(row).catch((e) => logger.warn({ err: e }, 'api_call_log write failed'));
  }

  private redact(headers?: Record<string, string>): Record<string, unknown> | null {
    if (!headers) return null;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(headers)) out[k] = SECRET_HEADERS.has(k.toLowerCase()) ? '***redacted***' : v;
    return out;
  }

  private stringify(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (Buffer.isBuffer(v) || v instanceof ArrayBuffer) return `[binary ${(v as ArrayBuffer).byteLength ?? ''} bytes]`;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  private cap(s: string): string {
    return s.length > BODY_CAP ? `${s.slice(0, BODY_CAP)}…[truncated ${s.length - BODY_CAP} chars]` : s;
  }
}

export const httpGateway = new HttpGatewayService();

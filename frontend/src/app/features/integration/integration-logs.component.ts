import { Component, computed, inject, signal } from '@angular/core';
import { IntegrationApiService, type ApiCallLog } from '../../core/api/integration.api.service';
import { formatDateTime } from '../../core/util/format';

/**
 * Admin viewer for the outbound third-party API audit log (api_call_log): every
 * call the ERP made through the HTTP gateway, newest first, with a detail drawer
 * showing the request/response for the selected row.
 */
@Component({
  selector: 'erp-integration-logs',
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <div class="text-muted small">Administration / Integrations</div>
        <h4 class="mb-0">Integration API logs</h4>
      </div>
      <button class="btn btn-sm btn-light" (click)="reload()"><i class="ph ph-arrows-clockwise"></i> Refresh</button>
    </div>

    <div class="il-grid" [class.il-grid--detail]="selected()">
      <div class="erp-card p-0 il-list">
        @if (loading()) {
          <div class="p-4 text-muted"><i class="ph ph-circle-notch"></i> Loading…</div>
        } @else if (logs().length === 0) {
          <div class="p-4 text-muted">No API calls logged yet.</div>
        } @else {
          <div class="il-scroll">
            <table class="il-tbl">
              <thead><tr><th>Time</th><th>Provider</th><th>Operation</th><th>Method</th><th class="num">Status</th><th class="num">ms</th></tr></thead>
              <tbody>
                @for (l of logs(); track l.id) {
                  <tr [class.on]="selected()?.id === l.id" (click)="select(l)">
                    <td>{{ fmt(l.createdAt) }}</td>
                    <td>{{ l.provider }}</td>
                    <td>{{ l.operation }}</td>
                    <td class="mono">{{ l.method }}</td>
                    <td class="num">
                      <span class="il-pill" [class.ok]="l.ok" [class.bad]="!l.ok">{{ l.respStatus ?? '—' }}</span>
                      @if (l.mock) { <span class="il-pill mock">mock</span> }
                    </td>
                    <td class="num">{{ l.durationMs }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      @if (selected(); as l) {
        <div class="erp-card p-3 il-detail">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="fw-semibold">{{ l.provider }} · {{ l.operation }}</div>
            <button class="btn-close" (click)="selected.set(null)"></button>
          </div>
          <div class="il-kv"><span>URL</span><code>{{ l.method }} {{ l.url }}</code></div>
          <div class="il-kv"><span>Result</span>
            <span class="il-pill" [class.ok]="l.ok" [class.bad]="!l.ok">{{ l.respStatus ?? '—' }}</span>
            {{ l.ok ? 'OK' : (l.errorMessage ?? 'Failed') }} · {{ l.durationMs }} ms @if (l.mock) { · mock }
          </div>
          @if (l.correlationId) { <div class="il-kv"><span>Correlation</span><code>{{ l.correlationId }}</code></div> }
          @if (l.entityType) { <div class="il-kv"><span>Record</span>{{ l.entityType }} {{ l.entityId }}</div> }
          <div class="il-h">Request</div>
          <pre class="il-pre">{{ pretty(l.reqBody) }}</pre>
          <div class="il-h">Response</div>
          <pre class="il-pre">{{ pretty(l.respBody) }}</pre>
        </div>
      }
    </div>
  `,
  styles: [`
    .il-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    .il-grid--detail { grid-template-columns: 1.4fr 1fr; }
    @media (max-width: 900px) { .il-grid--detail { grid-template-columns: 1fr; } }
    .il-list { overflow: hidden; }
    /* The log table can hold many rows — scroll inside the card, header pinned. */
    .il-scroll { max-height: calc(100vh - 210px); overflow-y: auto; }
    .il-tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
    .il-tbl thead th { position: sticky; top: 0; z-index: 1; }
    .il-tbl th { text-align: left; padding: 10px 14px; background: #fafafb; border-bottom: 1px solid #eee; font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #8b8b96; }
    .il-tbl td { padding: 9px 14px; border-bottom: 1px solid #f4f4f6; color: #3f3f46; }
    .il-tbl tbody tr { cursor: pointer; } .il-tbl tbody tr:hover { background: #fafafb; } .il-tbl tbody tr.on { background: #eef1fe; }
    .il-tbl .num { text-align: right; } .il-tbl .mono { font-family: var(--erp-font-mono, ui-monospace); }
    .il-pill { font-weight: 700; font-size: 10.5px; padding: 2px 7px; border-radius: 20px; }
    .il-pill.ok { background: #e9f7ef; color: #12834f; } .il-pill.bad { background: #fdecec; color: #ba1a1a; } .il-pill.mock { background: var(--erp-ai-tint,#f2eff8); color: var(--erp-ai,#9f7af3); margin-left: 4px; }
    .il-kv { display: flex; gap: 8px; font-size: 12.5px; margin-bottom: 6px; color: #3f3f46; }
    .il-kv span { min-width: 84px; color: #8b8b96; text-transform: uppercase; font-size: 10.5px; letter-spacing: .05em; padding-top: 2px; }
    .il-kv code { word-break: break-all; }
    .il-h { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: #8b8b96; font-weight: 700; margin: 12px 0 4px; }
    .il-pre { background: #0f0f14; color: #e6e6ef; border-radius: 8px; padding: 12px; font-size: 12px; max-height: 260px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
  `],
})
export class IntegrationLogsComponent {
  private readonly api = inject(IntegrationApiService);
  protected readonly logs = signal<ApiCallLog[]>([]);
  protected readonly loading = signal(true);
  protected readonly selected = signal<ApiCallLog | null>(null);

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.api.logs(undefined, 200).subscribe({
      next: (rows) => { this.logs.set(rows); this.loading.set(false); },
      error: () => { this.logs.set([]); this.loading.set(false); },
    });
  }
  protected select(l: ApiCallLog): void { this.selected.set(l); }
  protected fmt(v: string): string { return formatDateTime(v); }
  protected pretty(body: string | null): string {
    if (!body) return '—';
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
  }
}

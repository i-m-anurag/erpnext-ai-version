import { Component } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import type { ThreeWayMatchResult } from '../../core/api/integration.api.service';

/**
 * Interactive three-way-match result popup shown after an invoice is submitted:
 * header verdict, per-line qty/price checks, totals, tolerance + control checks,
 * and the outstanding amount / next action — so an AP user can judge the match
 * before moving the invoice to payment.
 */
@Component({
  selector: 'erp-three-way-match-modal',
  template: `
    @if (result; as r) {
      <div class="modal-header">
        <h5 class="modal-title"><i class="ph ph-sparkle text-ai"></i> Three-way match — {{ r.header.invoice_no }}</h5>
        <button type="button" class="btn-close" (click)="modalRef.hide()"></button>
      </div>
      <div class="modal-body">
        <div class="tw-verdict" [class.ok]="r.header.approved" [class.bad]="!r.header.approved">
          <i class="ph" [class.ph-check-circle]="r.header.approved" [class.ph-x-circle]="!r.header.approved"></i>
          <div>
            <div class="tw-verdict__title">{{ r.header.overall_result }}</div>
            <div class="tw-verdict__sub">{{ r.header.supplier }} · matched {{ r.header.match_date }} · {{ r.header.ap_analyst }}</div>
          </div>
        </div>

        <div class="tw-refs">
          <div><span>Invoice</span>{{ r.header.invoice_no }}</div>
          <div><span>PO</span>{{ r.header.po_no }}</div>
          <div><span>Receipt</span>{{ r.header.gr_no }}</div>
          <div><span>Requisition</span>{{ r.header.bill_no }}</div>
        </div>

        <div class="tw-scroll">
          <table class="tw-tbl">
            <thead>
              <tr>
                <th>#</th><th>Description</th>
                <th class="num">PO</th><th class="num">GR</th><th class="num">Inv</th><th class="c">Qty</th>
                <th class="num">PO price</th><th class="num">Inv price</th><th class="num">Var</th><th class="c">Price</th>
                <th class="num">Inv total</th><th class="c">Result</th>
              </tr>
            </thead>
            <tbody>
              @for (l of r.lines; track l.line) {
                <tr>
                  <td class="mono">{{ l.line }}</td>
                  <td>{{ l.description }}</td>
                  <td class="num">{{ l.po_qty }}</td>
                  <td class="num">{{ l.gr_qty }}</td>
                  <td class="num">{{ l.inv_qty }}</td>
                  <td class="c">{{ l.qty_match ? '✓' : '✗' }}</td>
                  <td class="num">{{ money(l.po_price) }}</td>
                  <td class="num">{{ money(l.inv_price) }}</td>
                  <td class="num">{{ money(l.variance) }}</td>
                  <td class="c">{{ l.price_match ? '✓' : '✗' }}</td>
                  <td class="num">{{ money(l.inv_total) }}</td>
                  <td class="c"><span class="tw-pill" [class.pass]="l.result === 'PASS'" [class.fail]="l.result !== 'PASS'">{{ l.result }}</span></td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="6"></td>
                <td class="num">Totals</td><td class="num"></td><td class="num"></td><td class="c"></td>
                <td class="num">{{ money(r.totals.inv_total) }}</td>
                <td class="c"><span class="tw-pill" [class.pass]="r.totals.match" [class.fail]="!r.totals.match">{{ r.totals.match ? 'MATCH' : 'DIFF' }}</span></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="tw-cols">
          <div>
            <div class="tw-h">Tolerances</div>
            @for (t of r.tolerances; track t.control) {
              <div class="tw-chk">
                <i class="ph" [class.ph-check-circle]="t.ok" [class.ph-warning-circle]="!t.ok" [class.ok]="t.ok" [class.bad]="!t.ok"></i>
                <div><b>{{ t.control }}</b> <span class="text-muted">{{ t.setting }}</span></div>
                <span class="tw-stat">{{ t.status }}</span>
              </div>
            }
          </div>
          <div>
            <div class="tw-h">Checks</div>
            @for (c of r.checks; track c.control) {
              <div class="tw-chk">
                <i class="ph" [class.ph-check-circle]="c.ok" [class.ph-warning-circle]="!c.ok" [class.ok]="c.ok" [class.bad]="!c.ok"></i>
                <div><b>{{ c.control }}</b> <span class="text-muted">{{ c.detail }}</span></div>
                <span class="tw-stat">{{ c.status }}</span>
              </div>
            }
          </div>
        </div>
      </div>
      <div class="modal-footer tw-foot">
        <div class="tw-out">Outstanding <b>{{ r.currency }} {{ money(r.outstanding) }}</b> · {{ r.next_action }}</div>
        <button type="button" class="btn btn-light" (click)="modalRef.hide()">Close</button>
      </div>
    }
  `,
  styles: [`
    .text-ai { color: var(--erp-ai, #9f7af3); }
    .tw-verdict { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 10px; margin-bottom: 16px; }
    .tw-verdict.ok { background: #e9f7ef; color: #12834f; } .tw-verdict.bad { background: #fdecec; color: #ba1a1a; }
    .tw-verdict > i { font-size: 30px; }
    .tw-verdict__title { font-weight: 700; font-size: 15px; }
    .tw-verdict__sub { font-size: 12.5px; opacity: .85; }
    .tw-refs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
    .tw-refs > div { background: #f4f3f1; border-radius: 8px; padding: 8px 12px; font-weight: 600; font-size: 13px; color: #17171a; }
    .tw-refs span { display: block; font-weight: 500; font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: #8b8b96; }
    .tw-scroll { overflow-x: auto; border: 1px solid #eee; border-radius: 8px; }
    .tw-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; white-space: nowrap; }
    .tw-tbl th { background: #fafafb; text-align: left; padding: 8px 10px; font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #8b8b96; border-bottom: 1px solid #eee; }
    .tw-tbl td { padding: 8px 10px; border-bottom: 1px solid #f4f4f6; color: #3f3f46; }
    .tw-tbl .num { text-align: right; } .tw-tbl .c { text-align: center; } .tw-tbl .mono { font-family: var(--erp-font-mono, ui-monospace); color: #4f46e5; }
    .tw-tbl tfoot td { font-weight: 700; color: #17171a; border-top: 1px solid #eee; }
    .tw-pill { font-weight: 700; font-size: 10.5px; padding: 2px 8px; border-radius: 20px; }
    .tw-pill.pass { background: #e9f7ef; color: #12834f; } .tw-pill.fail { background: #fdecec; color: #ba1a1a; }
    .tw-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; margin-top: 18px; }
    @media (max-width: 720px) { .tw-cols { grid-template-columns: 1fr; } .tw-refs { grid-template-columns: repeat(2,1fr); } }
    .tw-h { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: #8b8b96; font-weight: 700; margin-bottom: 8px; }
    .tw-chk { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 12.5px; }
    .tw-chk i { font-size: 16px; } .tw-chk i.ok { color: #12834f; } .tw-chk i.bad { color: #b25e00; }
    .tw-chk > div { flex: 1; min-width: 0; }
    .tw-stat { font-size: 10.5px; font-weight: 700; color: #12834f; }
    .tw-foot { display: flex; align-items: center; justify-content: space-between; }
    .tw-out { font-size: 13px; color: #46464d; }
  `],
})
export class ThreeWayMatchModalComponent {
  /** The match result (set by the opener). */
  result!: ThreeWayMatchResult;

  constructor(public readonly modalRef: BsModalRef) {}

  protected money(n: number): string {
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

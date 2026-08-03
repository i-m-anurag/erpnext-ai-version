import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { IntegrationApiService, type MatchRefs, type ThreeWayMatchResult } from '../../core/api/integration.api.service';

/**
 * Confirm the documents to reconcile before running a three-way match. Pre-filled
 * from the invoice's links / fields (server-resolved); the user completes any that
 * couldn't be resolved. Nothing is invented — all four numbers are required, so a
 * live reconcile only runs on real documents.
 */
@Component({
  selector: 'erp-three-way-match-refs-modal',
  imports: [FormsModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title"><i class="ph ph-scales text-match"></i> Three-way match</h5>
      <button type="button" class="btn-close" (click)="modalRef.hide()"></button>
    </div>
    <div class="modal-body">
      <p class="text-muted small mb-3">
        Confirm the documents to reconcile. We pre-filled what we could find from this
        invoice's links; complete any that are missing.
      </p>
      @if (error()) { <div class="alert alert-danger py-2">{{ error() }}</div> }

      <label class="mr-field">
        <span>Purchase Invoice</span>
        <input class="form-control form-control-sm" [value]="refs.invoice" readonly />
      </label>
      <label class="mr-field">
        <span>Requisition</span>
        <input class="form-control form-control-sm" [(ngModel)]="refs.materialRequest" placeholder="REQ-…" />
      </label>
      <label class="mr-field">
        <span>Purchase Order</span>
        <input class="form-control form-control-sm" [(ngModel)]="refs.purchaseOrder" placeholder="PO-…" />
      </label>
      <label class="mr-field">
        <span>Purchase Receipt</span>
        <input class="form-control form-control-sm" [(ngModel)]="refs.purchaseReceipt" placeholder="PR-…" />
      </label>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="modalRef.hide()">Cancel</button>
      <button type="button" class="btn btn-primary" [disabled]="!complete() || running()" (click)="run()">
        @if (running()) { <i class="ph ph-circle-notch"></i> Matching… } @else { <i class="ph ph-scales"></i> Run match }
      </button>
    </div>
  `,
  styles: [`
    .text-match { color: var(--erp-accent, #5f79eb); }
    .mr-field { display: block; margin-bottom: 12px; }
    .mr-field span { display: block; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: #8b8b96; font-weight: 600; margin-bottom: 4px; }
  `],
})
export class ThreeWayMatchRefsModalComponent {
  /** Pre-filled references (set by the opener). */
  refs: MatchRefs = { invoice: '', materialRequest: '', purchaseOrder: '', purchaseReceipt: '' };
  /** Emits the match result once the reconcile succeeds. */
  readonly matched = new Subject<ThreeWayMatchResult>();

  protected readonly running = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly api = inject(IntegrationApiService);
  constructor(public readonly modalRef: BsModalRef) {}

  protected complete(): boolean {
    const r = this.refs;
    return !!(r.invoice.trim() && r.materialRequest.trim() && r.purchaseOrder.trim() && r.purchaseReceipt.trim());
  }

  protected run(): void {
    if (!this.complete() || this.running()) return;
    this.running.set(true);
    this.error.set(null);
    this.api.threeWayMatch(this.refs).subscribe({
      next: (result) => {
        this.running.set(false);
        this.matched.next(result);
        this.modalRef.hide();
      },
      error: (e: { error?: { error?: { message?: string } } }) => {
        this.running.set(false);
        this.error.set(e?.error?.error?.message ?? 'Three-way match failed');
      },
    });
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LedgerApiService } from '../../core/api/ledger.api.service';
import { NotificationService } from '../../core/notify/notification.service';

/**
 * Period Close — set the ledger's posting-freeze date. No GL entry can be posted on
 * or before it, so closed periods can't be back-dated into.
 */
@Component({
  selector: 'erp-period-close',
  imports: [FormsModule],
  template: `
    <div class="mb-3"><div class="text-muted small">Accounting</div><h4 class="mb-0">Period Close</h4></div>

    <div class="erp-card p-4" style="max-width:560px">
      <div class="mb-2 fw-semibold">Posting freeze date</div>
      <p class="text-muted small mb-3">
        Entries dated on or before this date are locked — the ledger rejects any new posting into that period.
        Leave blank for no freeze.
      </p>
      <div class="d-flex align-items-end gap-2">
        <div>
          <label class="erp-field__label form-label">Freeze on/before</label>
          <input type="date" class="form-control form-control-sm" [(ngModel)]="freezeDate" />
        </div>
        <button class="btn btn-sm btn-primary" [disabled]="saving()" (click)="save()">
          <i class="ph ph-lock-simple"></i> {{ saving() ? 'Saving…' : 'Save' }}
        </button>
        <button class="btn btn-sm btn-light" [disabled]="saving() || !freezeDate" (click)="clear()">Clear</button>
      </div>
      @if (current()) {
        <div class="mt-3"><span class="iq-chip">Currently frozen up to {{ current() }}</span></div>
      } @else {
        <div class="mt-3 text-muted small">No freeze date set.</div>
      }
    </div>
  `,
  styles: [`
    .iq-chip { display: inline-block; padding: 3px 12px; border-radius: 999px; background: #fef3c7;
      border: 1px solid #fcd34d; color: #92400e; font-size: 0.8rem; font-weight: 500; }
  `],
})
export class PeriodCloseComponent {
  private readonly ledger = inject(LedgerApiService);
  private readonly notify = inject(NotificationService);

  protected freezeDate = '';
  protected readonly saving = signal(false);
  protected readonly current = signal<string | null>(null);

  constructor() {
    this.ledger.getSettings().subscribe((s) => this.apply(s.freezeDate));
  }

  protected save(): void {
    this.persist(this.freezeDate || null);
  }
  protected clear(): void {
    this.persist(null);
  }

  private persist(freezeDate: string | null): void {
    this.saving.set(true);
    this.ledger.setFreezeDate(freezeDate).subscribe({
      next: (s) => { this.saving.set(false); this.apply(s.freezeDate); this.notify.success('Period settings saved'); },
      error: () => { this.saving.set(false); this.notify.error('Could not save'); },
    });
  }

  private apply(freezeDate: string | null): void {
    const d = freezeDate ? freezeDate.slice(0, 10) : '';
    this.freezeDate = d;
    this.current.set(d || null);
  }
}

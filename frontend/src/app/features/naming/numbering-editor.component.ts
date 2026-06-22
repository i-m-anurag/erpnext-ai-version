import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NamingApiService } from '../../core/api/naming.api.service';
import { NotificationService } from '../../core/notify/notification.service';

/** Render a pattern with the current date + a sample counter (client preview). */
function preview(pattern: string, counter = 42): string {
  const now = new Date();
  const y = now.getFullYear();
  return pattern.replace(/\{(#+|YYYY|YY|MM|FY)\}/g, (_m, t: string) => {
    if (t.startsWith('#')) return String(counter).padStart(t.length, '0');
    if (t === 'YYYY') return String(y);
    if (t === 'YY') return String(y % 100).padStart(2, '0');
    if (t === 'MM') return String(now.getMonth() + 1).padStart(2, '0');
    if (t === 'FY') return String(y);
    return t;
  });
}

/**
 * Administration → Numbering → editor. Edit an entity's auto-id pattern + reset
 * policy with a live preview. Saves to the custom scope; reset reverts to default.
 */
@Component({
  selector: 'erp-numbering-editor',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <div class="text-muted small"><a routerLink="/app/m/admin/numbering">Numbering</a> / {{ slug() }}</div>
        <h4 class="mb-0">{{ slug() }}</h4>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-light text-danger" [disabled]="saving()" (click)="reset()"><i class="ph ph-arrow-counter-clockwise"></i> Reset</button>
        <button class="btn btn-sm btn-primary" [disabled]="saving()" (click)="save()"><i class="ph ph-check"></i> {{ saving() ? 'Saving…' : 'Save' }}</button>
      </div>
    </div>

    @if (loaded()) {
      <div class="erp-card p-4" style="max-width: 640px">
        <label class="erp-field__label form-label">Pattern</label>
        <input class="form-control mb-1" [ngModel]="pattern()" (ngModelChange)="pattern.set($event)" />
        <div class="text-muted small mb-3">
          Tokens: <code>{{ '{YYYY}' }}</code> year · <code>{{ '{YY}' }}</code> 2-digit · <code>{{ '{MM}' }}</code> month ·
          <code>{{ '{FY}' }}</code> fiscal year · <code>{{ '{#####}' }}</code> counter (padding = number of #).
        </div>

        <label class="erp-field__label form-label">Counter resets</label>
        <select class="form-select mb-3" style="max-width: 220px" [ngModel]="resetPolicy()" (ngModelChange)="resetPolicy.set($event)">
          <option value="never">Never</option>
          <option value="yearly">Every year</option>
          <option value="monthly">Every month</option>
        </select>

        <div class="erp-card p-3" style="background: var(--erp-surface-alt)">
          <div class="text-muted small mb-1">Next id preview</div>
          <div class="iq-mono" style="font-size: 1.1rem">{{ previewId() }}</div>
        </div>
      </div>
    } @else {
      <div class="erp-card p-4 text-muted"><i class="ph ph-circle-notch"></i> Loading…</div>
    }
  `,
})
export class NumberingEditorComponent {
  readonly slug = input.required<string>();

  private readonly api = inject(NamingApiService);
  private readonly notify = inject(NotificationService);

  protected readonly loaded = signal(false);
  protected readonly saving = signal(false);
  protected readonly pattern = signal('');
  protected readonly resetPolicy = signal<'never' | 'yearly' | 'monthly'>('yearly');
  protected readonly previewId = computed(() => preview(this.pattern()));

  constructor() {
    queueMicrotask(() => this.load());
  }
  private load(): void {
    this.api.get(this.slug()).subscribe((s) => {
      this.pattern.set(s.pattern);
      this.resetPolicy.set(s.reset);
      this.loaded.set(true);
    });
  }
  protected save(): void {
    this.saving.set(true);
    this.api.save(this.slug(), { pattern: this.pattern(), reset: this.resetPolicy() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.notify.success('Numbering saved');
      },
      error: (e: { error?: { error?: { message?: string } } }) => {
        this.saving.set(false);
        this.notify.error(e?.error?.error?.message ?? 'Save failed');
      },
    });
  }
  protected reset(): void {
    if (!confirm('Reset to the default pattern?')) return;
    this.saving.set(true);
    this.api.reset(this.slug()).subscribe({
      next: () => {
        this.saving.set(false);
        this.notify.success('Reverted to default');
        this.load();
      },
      error: () => {
        this.saving.set(false);
        this.notify.error('Nothing to reset');
      },
    });
  }
}

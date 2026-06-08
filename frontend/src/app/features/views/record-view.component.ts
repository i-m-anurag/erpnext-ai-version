import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { FormGroup } from '@angular/forms';
import { DynamicFormComponent } from '../../dynamic-form/dynamic-form.component';
import { FormBuilderService } from '../../dynamic-form/form-builder.service';
import { MasterApiService } from '../../core/api/master.api.service';
import { NotificationService } from '../../core/notify/notification.service';
import { ViewResolverService } from '../../core/config/view-resolver.service';
import type { ResolvedView, WorkflowStage } from '../../core/config/view-configs';

interface TimelineEvent {
  icon: string;
  title: string;
  meta: string;
}
interface Comment {
  author: string;
  initials: string;
  when: string;
  text: string;
}

/**
 * Generic Record/Form view resolved from a ViewConfig: dynamic form (left) +
 * contextual panels (right) — workflow stepper, activity timeline, comments/query
 * and an AI assist box. Backend-backed records load + save through the master API;
 * mock records render the same UI without persistence.
 */
@Component({
  selector: 'erp-record-view',
  imports: [RouterLink, DynamicFormComponent],
  template: `
    @if (config(); as cfg) {
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <div class="text-muted small">
          <a [routerLink]="['/app/m', cfg.module, cfg.sub]">{{ cfg.title }}</a>
          / {{ isNew() ? 'New' : recordId() }}@if (!cfg.backed) { · demo }
        </div>
        <h4 class="mb-0">{{ isNew() ? 'New ' + cfg.singular : recordId() }}</h4>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-light" [routerLink]="['/app/m', cfg.module, cfg.sub]">Cancel</button>
        <button class="btn btn-sm btn-ai"><i class="ph ph-sparkle"></i> Ask IQ</button>
        <button class="btn btn-sm btn-primary" [disabled]="saving()" (click)="save()">
          <i class="ph ph-check"></i> {{ saving() ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>

    @if (cfg.workflow; as wf) {
      <div class="iq-stepper mb-3">
        @for (s of wf.stages; track s.code) {
          <div class="iq-stepper__step" [class.done]="stageState(s) === 'done'"
               [class.current]="stageState(s) === 'current'">
            <span class="iq-stepper__dot">
              @if (stageState(s) === 'done') { <i class="ph ph-check"></i> } @else { {{ $index + 1 }} }
            </span>
            <span class="iq-stepper__label">{{ s.name }}</span>
          </div>
        }
      </div>
    }

    <div class="iq-record">
      <div class="iq-record__main erp-card p-4">
        @if (group(); as g) {
          <erp-dynamic-form [config]="cfg.form" [group]="g" />
        }
      </div>

      <div class="iq-record__side">
        <div class="erp-card p-3 iq-ai-panel">
          <div class="iq-ai-panel__head"><i class="ph ph-sparkle"></i> IQ Assist</div>
          <div class="iq-ai-panel__item"><i class="ph ph-lightbulb"></i><span>Vendor "Acme" has 2 overdue invoices — review before approval.</span></div>
          <div class="iq-ai-panel__item"><i class="ph ph-lightbulb"></i><span>Similar items were 8% cheaper from Globex last quarter.</span></div>
        </div>

        @if (cfg.panels.timeline) {
          <div class="erp-card p-3">
            <div class="fw-semibold mb-3">Activity</div>
            <div class="iq-timeline">
              @for (e of timeline; track e.title) {
                <div class="iq-timeline__item">
                  <span class="iq-timeline__dot"><i class="ph" [class]="e.icon"></i></span>
                  <div>
                    <div class="iq-timeline__title">{{ e.title }}</div>
                    <div class="iq-timeline__meta">{{ e.meta }}</div>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        @if (cfg.panels.comments) {
          <div class="erp-card p-3">
            <div class="fw-semibold mb-3">Comments &amp; queries</div>
            <div class="iq-comments">
              @for (c of comments; track c.when) {
                <div class="iq-comment">
                  <span class="iq-comment__avatar">{{ c.initials }}</span>
                  <div class="iq-comment__body">
                    <div class="iq-comment__head"><b>{{ c.author }}</b> <span class="text-muted small">{{ c.when }}</span></div>
                    <div>{{ c.text }}</div>
                  </div>
                </div>
              }
            </div>
            <div class="iq-comment-box mt-3">
              <input class="form-control form-control-sm" placeholder="Add a comment or raise a query…" />
              <button class="btn btn-sm btn-primary"><i class="ph ph-paper-plane-tilt"></i></button>
            </div>
          </div>
        }
      </div>
    </div>
    } @else if (loading()) {
      <div class="erp-card p-4 text-muted"><i class="ph ph-circle-notch"></i> Loading…</div>
    } @else {
      <div class="erp-card p-4">No view configured for this record.</div>
    }
  `,
})
export class RecordViewComponent {
  readonly slug = input.required<string>();
  readonly sub = input.required<string>();
  /** route param :id — the record id, or 'new' */
  readonly id = input.required<string>();

  private readonly fb = inject(FormBuilderService);
  private readonly resolver = inject(ViewResolverService);
  private readonly masters = inject(MasterApiService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly config = signal<ResolvedView | undefined>(undefined);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly recordId = computed(() => this.id());
  protected readonly isNew = computed(() => this.id() === 'new');

  constructor() {
    effect(() => {
      const module = this.slug();
      const sub = this.sub();
      this.config.set(undefined);
      this.loading.set(true);
      this.resolver.resolve(module, sub).subscribe({
        next: (cfg) => {
          this.config.set(cfg);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    });
  }

  protected readonly group = computed<FormGroup | undefined>(() => {
    const cfg = this.config();
    if (!cfg) return undefined;
    const g = this.fb.build(cfg.form);
    if (!this.isNew()) {
      const row = cfg.rows.find((r) => String(r[cfg.idKey]) === this.recordId());
      if (row) g.patchValue(this.coerce(cfg, row));
    }
    return g;
  });

  protected save(): void {
    const cfg = this.config();
    const g = this.group();
    if (!cfg || !g) return;
    if (g.invalid) {
      g.markAllAsTouched();
      this.notify.error('Please fix the highlighted fields');
      return;
    }
    if (!cfg.backed || !cfg.masterSlug) {
      this.notify.success('Saved (demo — not persisted)');
      void this.router.navigate(['/app/m', cfg.module, cfg.sub]);
      return;
    }
    const data = this.toApiData(cfg, g.getRawValue() as Record<string, unknown>);
    this.saving.set(true);
    const dbId = cfg.ids?.[this.recordId()];
    const req$ = this.isNew() || !dbId
      ? this.masters.createData(cfg.masterSlug, data)
      : this.masters.updateData(cfg.masterSlug, dbId, data);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.notify.success(`${cfg.singular} saved`);
        void this.router.navigate(['/app/m', cfg.module, cfg.sub]);
      },
      error: () => {
        this.saving.set(false);
        this.notify.error('Save failed');
      },
    });
  }

  /** Coerce form values to the types the backend validator expects (number/date). */
  private toApiData(cfg: ResolvedView, value: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...value };
    for (const f of cfg.form.fields) {
      const v = out[f.key];
      if (f.type === 'number' && typeof v === 'string' && v.trim() !== '') out[f.key] = Number(v);
      else if (f.type === 'date' && v instanceof Date) out[f.key] = v.toISOString();
    }
    return out;
  }

  /** coerce raw row values to control-friendly types (date strings → Date). */
  private coerce(cfg: ResolvedView, row: Record<string, unknown>): Record<string, unknown> {
    const dateKeys = new Set(cfg.form.fields.filter((f) => f.type === 'date').map((f) => f.key));
    const out: Record<string, unknown> = { ...row };
    for (const k of dateKeys) {
      if (typeof out[k] === 'string') out[k] = new Date(out[k] as string);
    }
    return out;
  }

  protected stageState(stage: WorkflowStage): 'done' | 'current' | 'todo' {
    const wf = this.config()?.workflow;
    if (!wf) return 'todo';
    const order = wf.stages.findIndex((s) => s.code === stage.code);
    const cur = wf.stages.findIndex((s) => s.code === wf.current);
    if (order < cur) return 'done';
    if (order === cur) return 'current';
    return 'todo';
  }

  protected readonly timeline: TimelineEvent[] = [
    { icon: 'ph-plus-circle', title: 'Record created', meta: 'by Admin · 2026-06-07 09:12' },
    { icon: 'ph-pencil-simple', title: 'Vendor updated', meta: 'by Admin · 2026-06-07 09:20' },
    { icon: 'ph-paper-plane-tilt', title: 'Submitted for approval', meta: 'by Admin · 2026-06-07 09:25' },
  ];
  protected readonly comments: Comment[] = [
    { author: 'Priya S.', initials: 'PS', when: '2h ago', text: 'Can we confirm the delivery date with the vendor?' },
    { author: 'Admin', initials: 'AD', when: '1h ago', text: 'Vendor confirmed — delivery on the 12th.' },
  ];
}

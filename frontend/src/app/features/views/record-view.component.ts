import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { FormGroup } from '@angular/forms';
import { DynamicFormComponent } from '../../dynamic-form/dynamic-form.component';
import { FormBuilderService } from '../../dynamic-form/form-builder.service';
import { MasterApiService } from '../../core/api/master.api.service';
import {
  ActivityApiService,
  type RecordComment,
  type TimelineEntry,
  type TimelineKind,
} from '../../core/api/activity.api.service';
import { NotificationService } from '../../core/notify/notification.service';
import { ViewResolverService } from '../../core/config/view-resolver.service';
import type { ResolvedView, WorkflowStage } from '../../core/config/view-configs';
import type { FormFieldDef } from '../../core/models/api.models';

const KIND_ICON: Record<TimelineKind, string> = {
  created: 'ph-plus-circle',
  updated: 'ph-pencil-simple',
  state_changed: 'ph-arrows-clockwise',
  assigned: 'ph-user-circle',
  commented: 'ph-chat-circle',
  email_sent: 'ph-envelope',
};

/**
 * Generic Record/Form view resolved from a ViewConfig: dynamic form (left) +
 * contextual panels (right) — workflow stepper, activity timeline, comments/query
 * and an AI assist box. Backend-backed records load + save through the master API;
 * mock records render the same UI without persistence.
 */
@Component({
  selector: 'erp-record-view',
  imports: [RouterLink, DynamicFormComponent, DatePipe, FormsModule],
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
              @for (e of timeline(); track e.id) {
                <div class="iq-timeline__item">
                  <span class="iq-timeline__dot"><i class="ph" [class]="icon(e.kind)"></i></span>
                  <div>
                    <div class="iq-timeline__title">{{ e.summary }}</div>
                    <div class="iq-timeline__meta">{{ e.actor?.name ?? 'System' }} · {{ e.createdAt | date: 'medium' }}</div>
                  </div>
                </div>
              } @empty {
                <div class="text-muted small">No activity yet.</div>
              }
            </div>
          </div>
        }

        @if (cfg.panels.comments) {
          <div class="erp-card p-3">
            <div class="fw-semibold mb-3">Comments &amp; queries</div>
            <div class="iq-comments">
              @for (c of comments(); track c.id) {
                <div class="iq-comment">
                  <span class="iq-comment__avatar">{{ initials(c.author.name) }}</span>
                  <div class="iq-comment__body">
                    <div class="iq-comment__head"><b>{{ c.author.name }}</b> <span class="text-muted small">{{ c.createdAt | date: 'short' }}</span></div>
                    <div>{{ c.body }}</div>
                  </div>
                </div>
              } @empty {
                <div class="text-muted small">No comments yet.</div>
              }
            </div>
            @if (canComment()) {
              <div class="iq-comment-box mt-3">
                <input class="form-control form-control-sm" placeholder="Add a comment or raise a query…"
                       [(ngModel)]="draft" (keyup.enter)="postComment()" [disabled]="posting()" />
                <button class="btn btn-sm btn-primary" (click)="postComment()" [disabled]="posting() || !draft.trim()">
                  <i class="ph ph-paper-plane-tilt"></i>
                </button>
              </div>
            } @else {
              <div class="text-muted small mt-2">Save the record to add comments.</div>
            }
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
  private readonly activity = inject(ActivityApiService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly config = signal<ResolvedView | undefined>(undefined);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly recordId = computed(() => this.id());
  protected readonly isNew = computed(() => this.id() === 'new');

  protected readonly timeline = signal<TimelineEntry[]>([]);
  protected readonly comments = signal<RecordComment[]>([]);
  protected readonly posting = signal(false);
  protected draft = '';

  constructor() {
    effect(() => {
      const module = this.slug();
      const sub = this.sub();
      this.config.set(undefined);
      this.timeline.set([]);
      this.comments.set([]);
      this.loading.set(true);
      this.resolver.resolve(module, sub).subscribe({
        next: (cfg) => {
          this.config.set(cfg);
          this.loading.set(false);
          this.loadActivity();
        },
        error: () => this.loading.set(false),
      });
    });
  }

  /** entity key for the activity API: the backing master slug. */
  private entityType(): string | undefined {
    return this.config()?.masterSlug;
  }
  protected canComment(): boolean {
    return !!this.config()?.backed && !this.isNew();
  }

  private loadActivity(): void {
    const entity = this.entityType();
    if (!entity || !this.canComment()) return;
    const rid = this.recordId();
    this.activity.timeline(entity, rid).subscribe((t) => this.timeline.set(t));
    this.activity.comments(entity, rid).subscribe((c) => this.comments.set(c));
  }

  protected postComment(): void {
    const entity = this.entityType();
    const body = this.draft.trim();
    if (!entity || !body || this.posting()) return;
    this.posting.set(true);
    this.activity.addComment(entity, this.recordId(), body).subscribe({
      next: (c) => {
        this.comments.update((list) => [...list, c]);
        this.draft = '';
        this.posting.set(false);
        this.activity.timeline(entity, this.recordId()).subscribe((t) => this.timeline.set(t));
      },
      error: () => {
        this.posting.set(false);
        this.notify.error('Could not post comment');
      },
    });
  }

  protected icon(kind: TimelineKind): string {
    return KIND_ICON[kind] ?? 'ph-circle';
  }
  protected initials(name: string): string {
    return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  }

  protected readonly group = computed<FormGroup | undefined>(() => {
    const cfg = this.config();
    if (!cfg) return undefined;
    let initial: Record<string, unknown> | undefined;
    if (!this.isNew()) {
      const row = cfg.rows.find((r) => String(r[cfg.idKey]) === this.recordId());
      if (row) initial = this.coerce(cfg, row);
    }
    return this.fb.build(cfg.form, initial);
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

  /** Coerce form values to the types the backend validator expects (number/date),
   *  including nested rows of `table` fields. */
  private toApiData(cfg: ResolvedView, value: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...value };
    for (const f of cfg.form.fields) {
      const v = out[f.key];
      if (f.type === 'table' && Array.isArray(v)) {
        out[f.key] = v.map((r) => this.coerceRowOut(f.columns ?? [], r as Record<string, unknown>));
      } else if (f.type === 'number' && typeof v === 'string' && v.trim() !== '') {
        out[f.key] = Number(v);
      } else if (f.type === 'date' && v instanceof Date) {
        out[f.key] = v.toISOString();
      }
    }
    return out;
  }

  private coerceRowOut(columns: FormFieldDef[], row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...row };
    for (const c of columns) {
      const v = out[c.key];
      if (c.type === 'number' && typeof v === 'string' && v.trim() !== '') out[c.key] = Number(v);
      else if (c.type === 'date' && v instanceof Date) out[c.key] = v.toISOString();
    }
    return out;
  }

  /** coerce raw row values to control-friendly types (date strings → Date),
   *  including nested rows of `table` fields. */
  private coerce(cfg: ResolvedView, row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...row };
    for (const f of cfg.form.fields) {
      if (f.type === 'date' && typeof out[f.key] === 'string') {
        out[f.key] = new Date(out[f.key] as string);
      } else if (f.type === 'table' && Array.isArray(out[f.key])) {
        const dateCols = (f.columns ?? []).filter((c) => c.type === 'date').map((c) => c.key);
        out[f.key] = (out[f.key] as Record<string, unknown>[]).map((r) => {
          const rr = { ...r };
          for (const dc of dateCols) if (typeof rr[dc] === 'string') rr[dc] = new Date(rr[dc] as string);
          return rr;
        });
      }
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

}

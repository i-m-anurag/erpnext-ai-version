import { Component, computed, effect, inject, input, signal, viewChild } from '@angular/core';
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
import { WorkflowApiService, type WorkflowStatus } from '../../core/api/workflow.api.service';
import { DocumentApiService, type CreateOption, type RelatedDoc } from '../../core/api/document.api.service';
import { NotificationService } from '../../core/notify/notification.service';
import { ViewResolverService } from '../../core/config/view-resolver.service';
import { routeForMaster, type ResolvedView } from '../../core/config/view-configs';
import { flattenDataFields, type FormFieldDef } from '../../core/models/api.models';
import {
  getFormController,
  registerFormControllers,
  type FormAction,
  type FormRecord,
  type StatusBadge,
} from '../../core/form-logic';

// Register client-side form controllers once when this view is first loaded.
registerFormControllers();

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
        @for (opt of createOptions(); track opt.to) {
          @if (opt.existing; as ex) {
            <button class="btn btn-sm btn-light" (click)="openExisting(ex)" [title]="ex.code">
              <i class="ph ph-arrow-square-out"></i> Go to {{ ex.code }}
            </button>
          } @else {
            <button class="btn btn-sm btn-light" (click)="createNextDoc(opt)"><i class="ph ph-arrow-bend-up-right"></i> {{ opt.label }}</button>
          }
        }
        <button class="btn btn-sm btn-ai"><i class="ph ph-sparkle"></i> Ask IQ</button>
        <button class="btn btn-sm btn-light" [disabled]="saving()" (click)="saveDraft()">
          <i class="ph ph-floppy-disk"></i> Save as Draft
        </button>
        <button class="btn btn-sm btn-primary" [disabled]="saving()" (click)="submit()">
          <i class="ph ph-check"></i> {{ saving() ? 'Saving…' : 'Submit' }}
        </button>
      </div>
    </div>

    @if (formRecord(); as fr) {
      <div class="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <span class="text-muted small">Status</span>
        <span class="iq-badge" [class]="'iq-badge--' + lifecycleTone(fr.status)">{{ prettyStatus(fr.status) }}</span>
        @if (statusBadge(); as b) {
          <span class="text-muted small ms-2">State</span>
          <span class="iq-badge" [class]="'iq-badge--' + (b.tone ?? 'default')">{{ b.label }}</span>
        }
        @for (a of customActions(); track a.key) {
          <button class="btn btn-sm btn-light ms-2" (click)="runAction(a)">
            @if (a.icon) { <i class="ph {{ a.icon }}"></i> } {{ a.label }}
          </button>
        }
      </div>
    }

    @if (wf(); as w) {
      @if (w.hasWorkflow) {
        <div class="iq-stepper mb-3">
          @for (s of w.states; track s.name; let i = $index) {
            <div class="iq-stepper__step" [class.done]="stateIndex(w) > i" [class.current]="s.name === w.currentState">
              <span class="iq-stepper__dot"
                    [style.background-color]="s.name === w.currentState && s.color ? s.color : null"
                    [style.border-color]="s.name === w.currentState && s.color ? s.color : null"
                    [style.color]="s.name === w.currentState && s.color ? '#fff' : null">
                @if (stateIndex(w) > i) { <i class="ph ph-check"></i> } @else { {{ i + 1 }} }
              </span>
              <span class="iq-stepper__label">{{ s.name }}</span>
            </div>
          }
        </div>
        @if (w.actions.length) {
          <div class="d-flex gap-2 mb-3 align-items-center">
            <span class="text-muted small">Actions:</span>
            @for (a of w.actions; track a.action) {
              <button class="btn btn-sm btn-primary" [disabled]="transitioning()" (click)="doTransition(a.action)">
                {{ a.action }}
              </button>
            }
          </div>
        }
      }
    }

    <div class="iq-record">
      <div class="iq-record__main erp-card p-4">
        @if (group(); as g) {
          <erp-dynamic-form [config]="cfg.form" [group]="g" />
        } @else {
          <div class="text-muted small"><i class="ph ph-circle-notch"></i> Loading record…</div>
        }
      </div>

      <div class="iq-record__side">
        @if (related().length) {
          <div class="erp-card p-3">
            <div class="fw-semibold mb-2">Related documents</div>
            @for (r of related(); track r.master + r.code) {
              <div class="iq-related" (click)="openRelated(r)">
                <i class="ph" [class.ph-arrow-up-left]="r.direction === 'up'" [class.ph-arrow-down-right]="r.direction === 'down'"></i>
                <div>
                  <div class="iq-mono">{{ r.code }}</div>
                  <div class="text-muted small">{{ relationLabel(r.relation) }}</div>
                </div>
              </div>
            }
          </div>
        }

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
  styles: [`
    .iq-badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 500;
      background: var(--erp-surface-alt); border: 1px solid var(--erp-border); color: var(--erp-text); }
    .iq-badge--info { background: #e0f2fe; border-color: #7dd3fc; color: #075985; }
    .iq-badge--success { background: #dcfce7; border-color: #86efac; color: #166534; }
    .iq-badge--warn { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
    .iq-badge--danger { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
  `],
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
  private readonly workflowApi = inject(WorkflowApiService);
  private readonly documents = inject(DocumentApiService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly formCmp = viewChild(DynamicFormComponent);

  protected readonly config = signal<ResolvedView | undefined>(undefined);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly recordId = computed(() => this.id());
  protected readonly isNew = computed(() => this.id() === 'new');

  protected readonly timeline = signal<TimelineEntry[]>([]);
  protected readonly comments = signal<RecordComment[]>([]);
  protected readonly posting = signal(false);
  protected draft = '';

  protected readonly wf = signal<WorkflowStatus | undefined>(undefined);
  protected readonly transitioning = signal(false);

  protected readonly related = signal<RelatedDoc[]>([]);
  protected readonly createOptions = signal<CreateOption[]>([]);
  /** The full record (incl. line-items) for the edit form. The list payload omits
   *  children for speed, so an existing record is loaded on its own here. */
  private readonly recordRow = signal<Record<string, unknown> | undefined>(undefined);
  /** Lifecycle status + business state of the loaded record (always shown in the header). */
  protected readonly recordStatus = signal<string | undefined>(undefined);
  protected readonly recordState = signal<string | null>(null);

  /** The record shape handed to the client form controller. */
  protected readonly formRecord = computed<FormRecord | undefined>(() => {
    const cfg = this.config();
    const rec = this.recordRow();
    if (!cfg?.masterSlug || !rec || this.isNew()) return undefined;
    return { slug: cfg.masterSlug, code: this.recordId(), data: rec, status: this.recordStatus() ?? 'active', state: this.recordState() };
  });
  /** Business-state badge: the controller's rendering, else the raw state text. */
  protected readonly statusBadge = computed<StatusBadge | undefined>(() => {
    const fr = this.formRecord();
    if (!fr) return undefined;
    const custom = getFormController(fr.slug)?.status?.(fr);
    if (custom) return custom;
    return fr.state ? { label: fr.state, tone: 'default' as const } : undefined;
  });
  /** Extra header buttons contributed by the form controller. */
  protected readonly customActions = computed<FormAction[]>(() => {
    const fr = this.formRecord();
    return fr ? (getFormController(fr.slug)?.actions?.(fr) ?? []) : [];
  });

  constructor() {
    effect(() => {
      const module = this.slug();
      const sub = this.sub();
      this.config.set(undefined);
      this.timeline.set([]);
      this.comments.set([]);
      this.wf.set(undefined);
      this.related.set([]);
      this.createOptions.set([]);
      this.loading.set(true);
      this.resolver.resolve(module, sub).subscribe({
        next: (cfg) => {
          this.config.set(cfg);
          this.loading.set(false);
          this.loadActivity();
          this.loadWorkflow();
          this.loadDocLinks();
        },
        error: () => this.loading.set(false),
      });
    });

    // Load the full record (with line-items) for the edit form. Runs when the
    // resolved config or the route id changes.
    effect(() => {
      const cfg = this.config();
      const rid = this.id();
      this.recordRow.set(undefined);
      this.recordStatus.set(undefined);
      this.recordState.set(null);
      if (!cfg?.backed || !cfg.masterSlug || rid === 'new') return;
      this.masters.getRecord(cfg.masterSlug, rid).subscribe({
        next: (row) => {
          this.recordRow.set(row.data);
          this.recordStatus.set(row.status);
          this.recordState.set(row.state ?? null);
        },
        error: () => this.recordRow.set(undefined),
      });
    });
  }

  private loadDocLinks(): void {
    const entity = this.entityType();
    if (!entity || !this.canComment()) return;
    this.documents.links(entity, this.recordId()).subscribe((r) => {
      this.related.set(r.related);
      this.createOptions.set(r.createOptions);
    });
  }

  protected createNextDoc(opt: CreateOption): void {
    const entity = this.entityType();
    if (!entity) return;
    this.documents.createNext(entity, this.recordId(), opt.to).subscribe({
      next: (created) => {
        this.notify.success(`${opt.label.replace('Create ', '')} ${created.code} created`);
        const route = routeForMaster(created.master);
        if (route) void this.router.navigate(['/app/m', route[0], route[1], created.code]);
      },
      error: (e: { error?: { error?: { message?: string } } }) =>
        this.notify.error(e?.error?.error?.message ?? 'Could not create document'),
    });
  }

  protected openRelated(r: RelatedDoc): void {
    const route = routeForMaster(r.master);
    if (route) void this.router.navigate(['/app/m', route[0], route[1], r.code]);
  }

  /** Redirect to a document that was already created from this record (#4). */
  protected openExisting(ex: { master: string; code: string }): void {
    const route = routeForMaster(ex.master);
    if (route) void this.router.navigate(['/app/m', route[0], route[1], ex.code]);
  }
  protected relationLabel(rel: string): string {
    return rel.replace(/_/g, ' ');
  }

  private loadWorkflow(): void {
    const entity = this.entityType();
    if (!entity || !this.canComment()) return;
    this.workflowApi.status(entity, this.recordId()).subscribe({
      next: (w) => this.wf.set(w),
      error: () => this.wf.set(undefined),
    });
  }

  protected stateIndex(w: WorkflowStatus): number {
    return w.states.findIndex((s) => s.name === w.currentState);
  }

  protected prettyStatus(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  protected lifecycleTone(s: string): string {
    return s === 'draft' ? 'default' : s === 'archived' ? 'danger' : 'success';
  }
  /** Run a controller-contributed header action with a small service context. */
  protected runAction(a: FormAction): void {
    const fr = this.formRecord();
    if (!fr) return;
    void a.run(fr, { notify: (m) => this.notify.success(m), reload: () => this.reloadRecord() });
  }
  private reloadRecord(): void {
    const cfg = this.config();
    if (!cfg?.masterSlug || this.isNew()) return;
    this.masters.getRecord(cfg.masterSlug, this.recordId()).subscribe((row) => {
      this.recordRow.set(row.data);
      this.recordStatus.set(row.status);
      this.recordState.set(row.state ?? null);
    });
  }

  protected doTransition(action: string): void {
    const entity = this.entityType();
    if (!entity || this.transitioning()) return;
    this.transitioning.set(true);
    this.workflowApi.transition(entity, this.recordId(), action).subscribe({
      next: (r) => {
        this.transitioning.set(false);
        this.notify.success(`${r.action} → ${r.to}`);
        this.loadWorkflow();
        this.activity.timeline(entity, this.recordId()).subscribe((t) => this.timeline.set(t));
      },
      error: (e: { error?: { error?: { message?: string } } }) => {
        this.transitioning.set(false);
        this.notify.error(e?.error?.error?.message ?? 'Transition failed');
      },
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
    if (this.isNew()) return this.fb.build(cfg.form);
    // Existing backed record: the list payload omits line-items, so we must build
    // the form from the dedicated full-record fetch (recordRow). Until it arrives,
    // return undefined (the view shows "Loading…") rather than building from the
    // empty list row — otherwise a save in that window would wipe the children.
    if (cfg.backed) {
      const rec = this.recordRow();
      return rec ? this.fb.build(cfg.form, this.coerce(cfg, rec)) : undefined;
    }
    // Non-backed (demo) views have their full row in cfg.rows.
    const row = cfg.rows.find((r) => String(r[cfg.idKey]) === this.recordId());
    return this.fb.build(cfg.form, row ? this.coerce(cfg, row) : undefined);
  });

  /** Submit: full validation. On error, reveal/scroll to the first invalid field
   *  (opening its accordion if needed) instead of silently failing. */
  protected submit(): void {
    const g = this.group();
    if (!g) return;
    if (g.invalid) {
      g.markAllAsTouched();
      this.formCmp()?.revealFirstInvalid();
      this.notify.error('Please fix the highlighted fields');
      return;
    }
    this.persist(false);
  }

  /** Save as draft: persist whatever is filled, no required-field validation. */
  protected saveDraft(): void {
    this.persist(true);
  }

  private persist(draft: boolean): void {
    const cfg = this.config();
    const g = this.group();
    if (!cfg || !g) return;
    if (!cfg.backed || !cfg.masterSlug) {
      this.notify.success('Saved (demo — not persisted)');
      void this.router.navigate(['/app/m', cfg.module, cfg.sub]);
      return;
    }
    const data = this.toApiData(cfg, g.getRawValue() as Record<string, unknown>);
    this.saving.set(true);
    const dbId = cfg.ids?.[this.recordId()];
    const req$ = this.isNew() || !dbId
      ? this.masters.createData(cfg.masterSlug, data, draft)
      : this.masters.updateData(cfg.masterSlug, dbId, data, draft);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.notify.success(draft ? `${cfg.singular} saved as draft` : `${cfg.singular} submitted`);
        void this.router.navigate(['/app/m', cfg.module, cfg.sub]);
      },
      error: (e: { error?: { error?: { message?: string } } }) => {
        this.saving.set(false);
        this.notify.error(e?.error?.error?.message ?? (draft ? 'Could not save draft' : 'Submit failed'));
      },
    });
  }

  /** Coerce form values to the types the backend validator expects (number/date),
   *  including nested rows of `table` fields. */
  private toApiData(cfg: ResolvedView, value: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...value };
    // Flatten display groups → their children are top-level keys; data groups
    // (nested:true) stay a single `group` field holding one sub-object.
    for (const f of flattenDataFields(cfg.form.fields)) {
      const v = out[f.key];
      if (f.type === 'table' && Array.isArray(v)) {
        out[f.key] = v.map((r) => this.coerceRowOut(f.columns ?? [], r as Record<string, unknown>));
      } else if (f.type === 'group' && v && typeof v === 'object') {
        // a data group is a single object — coerce its sub-fields like a table row
        out[f.key] = this.coerceRowOut(f.fields ?? [], v as Record<string, unknown>);
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
    for (const f of flattenDataFields(cfg.form.fields)) {
      if (f.type === 'date' && typeof out[f.key] === 'string') {
        out[f.key] = new Date(out[f.key] as string);
      } else if (f.type === 'table' && Array.isArray(out[f.key])) {
        const dateCols = (f.columns ?? []).filter((c) => c.type === 'date').map((c) => c.key);
        out[f.key] = (out[f.key] as Record<string, unknown>[]).map((r) => {
          const rr = { ...r };
          for (const dc of dateCols) if (typeof rr[dc] === 'string') rr[dc] = new Date(rr[dc] as string);
          return rr;
        });
      } else if (f.type === 'group' && out[f.key] && typeof out[f.key] === 'object') {
        const dateKeys = (f.fields ?? []).filter((s) => s.type === 'date').map((s) => s.key);
        const g = { ...(out[f.key] as Record<string, unknown>) };
        for (const dk of dateKeys) if (typeof g[dk] === 'string') g[dk] = new Date(g[dk] as string);
        out[f.key] = g;
      }
    }
    return out;
  }

}

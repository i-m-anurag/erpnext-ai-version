import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { NgSelectModule } from '@ng-select/ng-select';
import { MasterApiService } from '../../core/api/master.api.service';
import { FormApiService } from '../../core/api/form.api.service';
import { TemplateApiService, type TemplateSummary } from '../../core/api/template.api.service';
import { RolesApiService, type RoleOption } from '../../core/api/roles.api.service';
import {
  WorkflowDefApiService,
  type ApprovalConfig,
  type ApprovalRule,
  type ApprovalStep,
  type Condition,
  type Rule,
  type RuleAction,
  type RuleBranch,
  type WorkflowDef,
} from '../../core/api/workflow-def.api.service';
import type { FormFieldDef } from '../../core/models/api.models';
import { NotificationService } from '../../core/notify/notification.service';

const OPS: Condition['op'][] = ['==', '!=', '<', '<=', '>', '>='];
const ACTION_TYPES: RuleAction['type'][] = ['set_state', 'set_field', 'email', 'assign'];
const SWATCHES = ['#6b7280', '#5f79eb', '#9f7af3', '#f59e0b', '#22c55e', '#ef4444', '#06b6d4'];
const THRESH_OPS = ['>', '>=', '<', '<=', '==', '!='] as const;
type ThreshOp = (typeof THRESH_OPS)[number];

/** Plain threshold view-model for one approval tier's condition — no JSONLogic in
 *  the UI. `always` = the catch-all/base tier (no condition). Serialized to `when`. */
interface ThreshVM {
  always: boolean;
  field: string;
  op: ThreshOp;
  value: string;
}
/** An approval tier carrying its transient editing view-model. */
type EditTier = ApprovalRule & { __t?: ThreshVM };

/**
 * Rule-engine configurator: states + rules with if/else-if/else branches, each
 * running an action list (set_state / set_field / assign / email). Condition and
 * set_field field pickers come from the entity's FORM fields; roles come from the
 * roles list; email actions only offer templates whose variables this entity can
 * supply (appName, recordId, state + the entity's scalar fields).
 */
@Component({
  selector: 'erp-workflow-editor',
  imports: [FormsModule, RouterLink, NgSelectModule],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <div class="text-muted small"><a routerLink="/app/m/admin/workflows">Workflows</a> / {{ slug() }}</div>
        <h4 class="mb-0">{{ slug() }}</h4>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-light text-danger" [disabled]="saving()" (click)="reset()"><i class="ph ph-arrow-counter-clockwise"></i> Reset</button>
        <button class="btn btn-sm btn-primary" [disabled]="saving()" (click)="save()"><i class="ph ph-check"></i> {{ saving() ? 'Saving…' : 'Save' }}</button>
      </div>
    </div>

    @if (def(); as d) {
      <!-- Header -->
      <div class="erp-card p-3 mb-3 d-flex gap-4 flex-wrap align-items-end">
        <div>
          <label class="erp-field__label form-label">Applies to</label>
          <div><span class="iq-chip iq-chip--info">{{ d.appliesTo }}</span></div>
        </div>
        <div>
          <label class="erp-field__label form-label">Start state</label>
          <select class="form-select form-select-sm" [(ngModel)]="d.startState">
            @for (s of d.states; track s.name) { <option [value]="s.name">{{ s.name }}</option> }
          </select>
        </div>
      </div>

      <!-- States -->
      <div class="erp-card p-3 mb-3">
        <div class="fw-semibold mb-2">States</div>
        <table class="iq-rules__states">
          <thead><tr><th>State name</th><th style="width:120px">Colour</th><th style="width:36px"></th></tr></thead>
          @for (s of d.states; track $index; let i = $index) {
            <tr>
              <td><input class="form-control form-control-sm" [(ngModel)]="s.name" placeholder="State name" /></td>
              <td>
                <div class="d-flex align-items-center gap-1">
                  <input type="color" class="form-control form-control-sm form-control-color" [(ngModel)]="s.color" list="swatches" />
                </div>
              </td>
              <td><button class="btn-icon" (click)="d.states.splice(i,1)"><i class="ph ph-trash"></i></button></td>
            </tr>
          }
        </table>
        <datalist id="swatches">@for (c of swatches; track c) { <option [value]="c"></option> }</datalist>
        <button class="btn btn-sm btn-light mt-2" (click)="d.states.push({ name: '', color: '#6b7280' })"><i class="ph ph-plus"></i> Add state</button>
      </div>

      <!-- Approval rules -->
      <div class="fw-semibold mb-2">Approval rules
        <span class="text-muted small fw-normal">— who must approve an action, based on amount (checked top-to-bottom, first match wins)</span>
      </div>
      @for (cfg of d.approvals!; track $index; let ci = $index) {
        <div class="erp-card p-3 mb-3 iq-rule">
          <div class="d-flex flex-wrap gap-3 align-items-end mb-3">
            <div style="max-width:150px">
              <label class="erp-field__label form-label">On action</label>
              <input class="form-control form-control-sm fw-semibold" [(ngModel)]="cfg.action" placeholder="e.g. Submit" />
            </div>
            <div>
              <label class="erp-field__label form-label">While pending</label>
              <select class="form-select form-select-sm" [(ngModel)]="cfg.pendingState">
                @for (s of d.states; track s.name) { <option [value]="s.name">{{ s.name }}</option> }
              </select>
            </div>
            <div>
              <label class="erp-field__label form-label">If approved →</label>
              <select class="form-select form-select-sm" [(ngModel)]="cfg.onApproved">
                @for (s of d.states; track s.name) { <option [value]="s.name">{{ s.name }}</option> }
              </select>
            </div>
            <div>
              <label class="erp-field__label form-label">If rejected →</label>
              <select class="form-select form-select-sm" [(ngModel)]="cfg.onRejected">
                @for (s of d.states; track s.name) { <option [value]="s.name">{{ s.name }}</option> }
              </select>
            </div>
            <button class="btn-icon text-danger ms-auto" (click)="d.approvals!.splice(ci,1)"><i class="ph ph-trash"></i></button>
          </div>

          @for (tier of cfg.rules; track $index; let ti = $index) {
            <div class="iq-branch mb-2">
              <div class="d-flex align-items-center justify-content-between mb-1">
                <span class="iq-branch__label">{{ threshOf(tier).always ? 'OTHERWISE' : 'IF' }}</span>
                <button class="btn-icon text-danger" (click)="cfg.rules.splice(ti,1)"><i class="ph ph-x"></i></button>
              </div>
              <div class="d-flex gap-2 align-items-center mb-2 flex-wrap">
                <label class="small d-flex align-items-center gap-1 mb-0">
                  <input type="checkbox" class="form-check-input mt-0" [(ngModel)]="threshOf(tier).always" /> applies to all (base tier)
                </label>
                @if (!threshOf(tier).always) {
                  <span class="text-muted small">when</span>
                  <select class="form-select form-select-sm" style="max-width:170px" [(ngModel)]="threshOf(tier).field">
                    @for (f of fields(); track f.key) { <option [value]="f.key">{{ f.label }}</option> }
                  </select>
                  <select class="form-select form-select-sm" style="max-width:80px" [(ngModel)]="threshOf(tier).op">
                    @for (o of threshOps; track o) { <option [value]="o">{{ o }}</option> }
                  </select>
                  <input type="number" class="form-control form-control-sm" style="max-width:130px" [(ngModel)]="threshOf(tier).value" placeholder="amount" />
                }
              </div>

              <div class="iq-branch__then text-muted small">APPROVERS (in order)</div>
              @for (st of tier.steps; track $index; let si = $index) {
                <div class="d-flex gap-2 align-items-center mb-1 flex-wrap">
                  <span class="text-muted small">{{ si + 1 }}.</span>
                  <select class="form-select form-select-sm" style="max-width:100px" [(ngModel)]="st.approver">
                    <option value="role">role</option><option value="user">user</option>
                  </select>
                  @if (st.approver === 'role') {
                    <select class="form-select form-select-sm" style="max-width:160px" [(ngModel)]="st.role">
                      @for (ro of roles(); track ro.code) { <option [value]="ro.code">{{ ro.name }}</option> }
                    </select>
                    <label class="small d-flex align-items-center gap-1 mb-0">
                      <input type="checkbox" class="form-check-input mt-0" [(ngModel)]="st.branchScoped" /> branch-scoped
                    </label>
                  } @else {
                    <input class="form-control form-control-sm" style="max-width:220px" [(ngModel)]="st.user" placeholder="user id" />
                  }
                  <button class="btn-icon" (click)="tier.steps.splice(si,1)"><i class="ph ph-x"></i></button>
                </div>
              }
              <button class="btn btn-sm btn-link p-0" (click)="tier.steps.push(freshStep())">+ approver</button>
            </div>
          }
          <button class="btn btn-sm btn-light" (click)="addTier(cfg)"><i class="ph ph-plus"></i> Add tier</button>
        </div>
      }
      <button class="btn btn-sm btn-primary mb-3" (click)="addApproval()"><i class="ph ph-plus"></i> Add approval chain</button>

      <!-- Rules -->
      <div class="fw-semibold mb-2">Rules</div>
      @for (r of d.rules; track $index; let ri = $index) {
        <div class="erp-card p-3 mb-3 iq-rule">
          <div class="d-flex align-items-end justify-content-between mb-2">
            <div style="max-width:320px;flex:1">
              <label class="erp-field__label form-label">Rule name</label>
              <input class="form-control form-control-sm fw-semibold" [(ngModel)]="r.name" placeholder="e.g. Submit for approval" />
            </div>
            <button class="btn-icon text-danger" (click)="d.rules.splice(ri,1)"><i class="ph ph-trash"></i></button>
          </div>

          <!-- Trigger -->
          <div class="iq-rule__trigger d-flex flex-wrap gap-2 align-items-center mb-3">
            <span class="text-muted small">WHEN user clicks</span>
            <input class="form-control form-control-sm" style="max-width:150px" [(ngModel)]="r.trigger.action" placeholder="Action (e.g. Submit)" />
            <span class="text-muted small">from</span>
            <select class="form-select form-select-sm" style="max-width:160px" [ngModel]="r.trigger.fromState ?? ''" (ngModelChange)="r.trigger.fromState = $event || null">
              <option value="">Any state</option>
              @for (s of d.states; track s.name) { <option [value]="s.name">{{ s.name }}</option> }
            </select>
            <span class="text-muted small">· roles</span>
            <ng-select class="iq-roles-select" [items]="roles()" bindValue="code" bindLabel="name" [multiple]="true"
                       appendTo="body" [(ngModel)]="r.trigger.roles" placeholder="Any role" style="min-width:220px" />
          </div>

          <!-- Branches -->
          @for (b of r.branches; track $index; let bi = $index) {
            <div class="iq-branch mb-2">
              <div class="d-flex align-items-center justify-content-between mb-1">
                <span class="iq-branch__label">{{ b.conditions.length ? (bi === 0 ? 'IF' : 'ELSE IF') : 'ELSE' }}</span>
                <button class="btn-icon text-danger" (click)="r.branches.splice(bi,1)"><i class="ph ph-x"></i></button>
              </div>

              @for (c of b.conditions; track $index; let ci = $index) {
                <div class="d-flex gap-2 align-items-center mb-1">
                  <select class="form-select form-select-sm" style="max-width:200px" [(ngModel)]="c.field">
                    @for (f of fields(); track f.key) { <option [value]="f.key">{{ f.label }}</option> }
                  </select>
                  <select class="form-select form-select-sm" style="max-width:90px" [(ngModel)]="c.op">
                    @for (o of ops; track o) { <option [value]="o">{{ o }}</option> }
                  </select>
                  <input class="form-control form-control-sm" style="max-width:200px" [ngModel]="c.value" (ngModelChange)="c.value = $event" placeholder="value" />
                  <button class="btn-icon" (click)="b.conditions.splice(ci,1)"><i class="ph ph-x"></i></button>
                </div>
              }
              <button class="btn btn-sm btn-link p-0 mb-2" (click)="b.conditions.push({ field: firstField(), op: '==', value: '' })">+ condition</button>

              <div class="iq-branch__then text-muted small">THEN</div>
              @for (a of b.actions; track $index; let ai = $index) {
                <div class="d-flex gap-2 align-items-center mb-1 flex-wrap">
                  <select class="form-select form-select-sm" style="max-width:130px" [ngModel]="a.type" (ngModelChange)="setActionType(b, ai, $event)">
                    @for (t of actionTypes; track t) { <option [value]="t">{{ t }}</option> }
                  </select>
                  @switch (a.type) {
                    @case ('set_state') {
                      <span class="text-muted small">→</span>
                      <select class="form-select form-select-sm" style="max-width:170px" [(ngModel)]="$any(a).to">
                        @for (s of d.states; track s.name) { <option [value]="s.name">{{ s.name }}</option> }
                      </select>
                    }
                    @case ('set_field') {
                      <select class="form-select form-select-sm" style="max-width:160px" [(ngModel)]="$any(a).field">
                        @for (f of fields(); track f.key) { <option [value]="f.key">{{ f.label }}</option> }
                      </select>
                      <span class="text-muted small">=</span>
                      <input class="form-control form-control-sm" style="max-width:140px" [(ngModel)]="$any(a).value" placeholder="value" />
                    }
                    @case ('email') {
                      <span class="text-muted small">template</span>
                      <select class="form-select form-select-sm" style="max-width:180px" [(ngModel)]="$any(a).template">
                        @for (t of compatibleTemplates(); track t.slug) { <option [value]="t.slug">{{ t.slug }}</option> }
                      </select>
                      <input class="form-control form-control-sm" style="max-width:220px" [ngModel]="$any(a).to.join(', ')" (ngModelChange)="$any(a).to = splitCsv($event)" placeholder="role:admin, {{ '{{' }}doc.email{{ '}}' }}" />
                    }
                    @case ('assign') {
                      <span class="text-muted small">role</span>
                      <select class="form-select form-select-sm" style="max-width:160px" [(ngModel)]="$any(a).role">
                        <option value="">— role —</option>
                        @for (ro of roles(); track ro.code) { <option [value]="ro.code">{{ ro.name }}</option> }
                      </select>
                      <select class="form-select form-select-sm" style="max-width:140px" [(ngModel)]="$any(a).strategy">
                        <option value="least_loaded">least loaded</option><option value="round_robin">round robin</option>
                      </select>
                    }
                  }
                  <button class="btn-icon" (click)="b.actions.splice(ai,1)"><i class="ph ph-x"></i></button>
                </div>
              }
              <button class="btn btn-sm btn-link p-0" (click)="b.actions.push({ type: 'set_state', to: d.states[0]?.name ?? '' })">+ action</button>
            </div>
          }
          <button class="btn btn-sm btn-light" (click)="r.branches.push({ conditions: [], actions: [] })"><i class="ph ph-git-branch"></i> Add branch (if/else)</button>
        </div>
      }
      <button class="btn btn-sm btn-primary" (click)="addRule()"><i class="ph ph-plus"></i> Add rule</button>
      <div class="text-muted small mt-2">
        <i class="ph ph-info"></i> Email merge fields available here: <code>{{ availableVars().join(', ') }}</code>.
        Only templates using these fields are offered.
      </div>
    } @else {
      <div class="erp-card p-4 text-muted"><i class="ph ph-circle-notch"></i> Loading…</div>
    }
  `,
})
export class WorkflowEditorComponent {
  readonly slug = input.required<string>();

  private readonly api = inject(WorkflowDefApiService);
  private readonly masters = inject(MasterApiService);
  private readonly formApi = inject(FormApiService);
  private readonly templateApi = inject(TemplateApiService);
  private readonly rolesApi = inject(RolesApiService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly def = signal<WorkflowDef | undefined>(undefined);
  protected readonly fields = signal<{ key: string; label: string }[]>([]);
  protected readonly templatesAll = signal<TemplateSummary[]>([]);
  protected readonly roles = signal<RoleOption[]>([]);
  protected readonly saving = signal(false);
  protected readonly ops = OPS;
  protected readonly threshOps = THRESH_OPS;
  protected readonly actionTypes = ACTION_TYPES;
  protected readonly swatches = SWATCHES;

  /** Variables a rule email action can supply for THIS entity. */
  protected readonly availableVars = computed(() => ['appName', 'recordId', 'state', ...this.fields().map((f) => f.key)]);
  /** Only templates whose declared variables are all satisfiable here. */
  protected readonly compatibleTemplates = computed(() => {
    const avail = new Set(this.availableVars());
    return this.templatesAll().filter((t) => t.variables.every((v) => avail.has(v)));
  });

  constructor() {
    queueMicrotask(() => this.load());
  }

  private load(): void {
    this.templateApi.list().subscribe((t) => this.templatesAll.set(t));
    this.rolesApi.list().subscribe((r) => this.roles.set(r));
    this.api.get(this.slug()).subscribe((wf) => {
      wf.approvals ??= [];
      for (const cfg of wf.approvals) for (const tier of cfg.rules) (tier as EditTier).__t = this.hydrateThresh(tier.when);
      this.def.set(wf);
      this.masters.getMaster(wf.appliesTo).subscribe((m) => {
        if (!m.formSlug) return;
        this.formApi.getForm(m.formSlug).subscribe((form) => this.fields.set(this.flattenFields(form.fields)));
      });
    });
  }

  /** Leaf form fields, flattening display-group children (e.g. the nested `amount`
   *  inside an Order Details group) so they're pickable as `doc.<key>`. */
  private flattenFields(fields: FormFieldDef[]): { key: string; label: string }[] {
    const out: { key: string; label: string }[] = [];
    for (const f of fields) {
      if (f.type === 'group' && Array.isArray(f.fields)) { out.push(...this.flattenFields(f.fields)); continue; }
      if (f.type === 'table' || f.type === 'group') continue;
      out.push({ key: f.key, label: f.label });
    }
    return out;
  }

  protected splitCsv(s: string): string[] {
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }
  protected firstField(): string {
    return this.fields()[0]?.key ?? '';
  }
  protected addRule(): void {
    this.def()?.rules.push({
      name: 'New rule',
      trigger: { on: 'action', action: '', fromState: null, roles: [] },
      branches: [{ conditions: [], actions: [] }],
    } as Rule);
  }
  protected setActionType(branch: RuleBranch, i: number, type: RuleAction['type']): void {
    const states = this.def()?.states ?? [];
    const fresh: Record<RuleAction['type'], RuleAction> = {
      set_state: { type: 'set_state', to: states[0]?.name ?? '' },
      set_field: { type: 'set_field', field: this.firstField(), value: '' },
      email: { type: 'email', template: this.compatibleTemplates()[0]?.slug ?? '', to: [] },
      assign: { type: 'assign', role: '', strategy: 'least_loaded' },
    };
    branch.actions[i] = fresh[type];
  }

  // ── approval rules ──────────────────────────────────────────────────────────
  protected addApproval(): void {
    const d = this.def();
    if (!d) return;
    const first = d.states[0]?.name ?? '';
    const pending = d.states.find((s) => /pend/i.test(s.name))?.name ?? first;
    const approved = d.states.find((s) => /approv/i.test(s.name))?.name ?? first;
    const rejected = d.states.find((s) => /reject/i.test(s.name))?.name ?? first;
    (d.approvals ??= []).push({
      action: '', pendingState: pending, onApproved: approved, onRejected: rejected,
      rules: [{ steps: [this.freshStep()], __t: this.hydrateThresh(undefined) } as EditTier],
    });
  }
  protected addTier(cfg: ApprovalConfig): void {
    cfg.rules.push({ steps: [this.freshStep()], __t: this.hydrateThresh(undefined) } as EditTier);
  }
  protected freshStep(): ApprovalStep {
    return { approver: 'role', role: this.roles()[0]?.code ?? '', branchScoped: true };
  }
  protected threshOf(tier: ApprovalRule): ThreshVM {
    return ((tier as EditTier).__t ??= this.hydrateThresh(tier.when));
  }

  /** Parse a stored `when` into the plain threshold VM. Only simple
   *  `doc.<field> <op> <number>` is representable; anything else → base tier. */
  private hydrateThresh(when?: Record<string, unknown>): ThreshVM {
    const base: ThreshVM = { always: true, field: this.fields()[0]?.key ?? '', op: '>', value: '' };
    if (!when || Object.keys(when).length === 0) return base;
    const op = Object.keys(when)[0] as ThreshOp;
    const args = (when as Record<string, unknown>)[op];
    if ((THRESH_OPS as readonly string[]).includes(op) && Array.isArray(args) && args.length === 2) {
      const [l, r] = args as [unknown, unknown];
      const path = l && typeof l === 'object' && 'var' in (l as object) ? String((l as { var: unknown }).var) : '';
      if (path.startsWith('doc.') && typeof r !== 'object') {
        return { always: false, field: path.slice(4), op, value: String(r ?? '') };
      }
    }
    return base;
  }
  /** Threshold VM → JSONLogic `when` (or undefined for the base/always tier). */
  private serializeThresh(vm: ThreshVM | undefined): Record<string, unknown> | undefined {
    if (!vm || vm.always || !vm.field) return undefined;
    const n = Number(vm.value);
    return { [vm.op]: [{ var: `doc.${vm.field}` }, Number.isNaN(n) ? vm.value : n] };
  }

  protected save(): void {
    const d = this.def();
    if (!d) return;
    // Fold each tier's threshold VM back into `when`, then strip the transient VM.
    for (const cfg of d.approvals ?? []) {
      for (const tier of cfg.rules) {
        const et = tier as EditTier;
        tier.when = this.serializeThresh(et.__t);
        delete et.__t;
      }
    }
    this.saving.set(true);
    this.api.save(this.slug(), d).subscribe({
      next: () => {
        this.saving.set(false);
        this.notify.success('Workflow saved');
      },
      error: (e: { error?: { error?: { message?: string } } }) => {
        this.saving.set(false);
        this.notify.error(e?.error?.error?.message ?? 'Save failed');
      },
    });
  }
  protected reset(): void {
    if (!confirm('Reset this workflow to the shipped default? Customisations will be removed.')) return;
    this.saving.set(true);
    this.api.reset(this.slug()).subscribe({
      next: () => {
        this.saving.set(false);
        this.notify.success('Reverted to default');
        this.load();
      },
      error: () => {
        this.saving.set(false);
        this.notify.error('Nothing to reset (already default)');
      },
    });
  }
}

import { Component, inject, input, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import type { FormGroup } from '@angular/forms';
import { DynamicFormComponent } from '../../dynamic-form/dynamic-form.component';
import { FormBuilderService } from '../../dynamic-form/form-builder.service';
import { MasterApiService } from '../../core/api/master.api.service';
import { WorkflowDefApiService, type WorkflowDef } from '../../core/api/workflow-def.api.service';
import { NotificationService } from '../../core/notify/notification.service';
import type { FormDefinition } from '../../core/models/api.models';

/**
 * Workflow configurator — edits a workflow definition (states + transitions)
 * with the SAME dynamic-form engine + tabular field used everywhere else: a
 * header (applies-to + start state) plus a States table and a Transitions table
 * with add/remove rows. Saves to the custom scope.
 */
@Component({
  selector: 'erp-workflow-editor',
  imports: [RouterLink, DynamicFormComponent],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <div class="text-muted small"><a routerLink="/app/m/admin/workflows">Workflows</a> / {{ slug() }}</div>
        <h4 class="mb-0">{{ slug() }}</h4>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-light text-danger" [disabled]="saving()" (click)="reset()"><i class="ph ph-arrow-counter-clockwise"></i> Reset to default</button>
        <button class="btn btn-sm btn-primary" [disabled]="saving()" (click)="save()"><i class="ph ph-check"></i> {{ saving() ? 'Saving…' : 'Save' }}</button>
      </div>
    </div>

    @if (config() && group(); as _) {
      <div class="erp-card p-4">
        <erp-dynamic-form [config]="config()!" [group]="group()!" />
      </div>
      <div class="text-muted small mt-2">
        <i class="ph ph-info"></i> <b>From</b>/<b>To</b>/<b>Start state</b> must match a state name above.
        <b>Roles</b> = comma-separated role codes (empty = any). <b>Condition</b> e.g. <code>doc.total &lt;= 100000</code> (empty = always).
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
  private readonly fb = inject(FormBuilderService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly config = signal<FormDefinition | undefined>(undefined);
  protected readonly group = signal<FormGroup | undefined>(undefined);
  protected readonly saving = signal(false);

  constructor() {
    queueMicrotask(() => this.load());
  }

  private load(): void {
    this.masters.listMasters().subscribe((masters) => {
      const masterOptions = masters.map((m) => ({ value: m.slug, label: m.name }));
      this.api.get(this.slug()).subscribe((wf) => {
        this.config.set(this.buildDef(masterOptions));
        const initial = {
          appliesTo: wf.appliesTo,
          startState: wf.startState,
          states: wf.states,
          transitions: wf.transitions.map((t) => ({ ...t, roles: (t.roles ?? []).join(', ') })),
        };
        this.group.set(this.fb.build(this.config()!, initial));
      });
    });
  }

  /** The form definition for the workflow editor (header + 2 tables). */
  private buildDef(masterOptions: { value: string; label: string }[]): FormDefinition {
    return {
      slug: 'workflow',
      title: 'Workflow',
      layout: 'two-column',
      fields: [
        { key: 'appliesTo', type: 'select', label: 'Applies to (master)', required: true, options: masterOptions },
        { key: 'startState', type: 'text', label: 'Start state', required: true },
        {
          key: 'states',
          type: 'table',
          label: 'States',
          required: true,
          minRows: 1,
          columns: [
            { key: 'name', type: 'text', label: 'State', required: true },
            { key: 'color', type: 'select', label: 'Color', options: [
              { value: 'secondary', label: 'Grey' },
              { value: 'info', label: 'Blue' },
              { value: 'warning', label: 'Amber' },
              { value: 'success', label: 'Green' },
              { value: 'danger', label: 'Red' },
            ] },
          ],
        },
        {
          key: 'transitions',
          type: 'table',
          label: 'Transitions',
          required: true,
          minRows: 1,
          columns: [
            { key: 'action', type: 'text', label: 'Action', required: true },
            { key: 'from', type: 'text', label: 'From', required: true },
            { key: 'to', type: 'text', label: 'To', required: true },
            { key: 'roles', type: 'text', label: 'Roles (comma-sep)' },
            { key: 'condition', type: 'text', label: 'Condition' },
          ],
        },
      ],
    };
  }

  protected save(): void {
    const g = this.group();
    if (!g) return;
    if (g.invalid) {
      g.markAllAsTouched();
      this.notify.error('Please fix the highlighted fields');
      return;
    }
    const v = g.getRawValue() as {
      appliesTo: string;
      startState: string;
      states: { name: string; color?: string }[];
      transitions: { action: string; from: string; to: string; roles?: string; condition?: string }[];
    };
    const def: WorkflowDef = {
      slug: this.slug(),
      appliesTo: v.appliesTo,
      startState: v.startState,
      states: v.states,
      transitions: v.transitions.map((t) => ({
        action: t.action,
        from: t.from,
        to: t.to,
        roles: (t.roles ?? '').split(',').map((r) => r.trim()).filter(Boolean),
        condition: (t.condition ?? '').trim() || null,
      })),
    };
    this.saving.set(true);
    this.api.save(this.slug(), def).subscribe({
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

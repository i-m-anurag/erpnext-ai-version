import { Component, inject, type OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WorkflowDefApiService, type WorkflowSummary } from '../../core/api/workflow-def.api.service';

/** Administration → Workflows. Lists workflow definitions; click to configure. */
@Component({
  selector: 'erp-workflows-list',
  imports: [],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <div class="text-muted small">Administration · Automation</div>
        <h4 class="mb-0">Workflows</h4>
      </div>
    </div>

    <div class="erp-card p-0">
      <table class="table table-hover mb-0 align-middle iq-table">
        <thead>
          <tr><th>Workflow</th><th>Applies to</th><th class="text-end">States</th><th class="text-end">Transitions</th><th>Source</th><th></th></tr>
        </thead>
        <tbody>
          @for (w of workflows(); track w.slug) {
            <tr style="cursor: pointer" (click)="open(w)">
              <td class="fw-medium"><i class="ph ph-flow-arrow text-muted me-2"></i>{{ w.slug }}</td>
              <td><span class="iq-mono text-muted">{{ w.appliesTo }}</span></td>
              <td class="text-end iq-mono text-muted">{{ w.states }}</td>
              <td class="text-end iq-mono text-muted">{{ w.transitions }}</td>
              <td>
                <span class="iq-chip" [class]="w.resolvedFrom === 'merged' ? 'iq-chip--ok' : 'iq-chip--warn'">
                  {{ w.resolvedFrom === 'merged' ? 'Customised' : 'Default' }}
                </span>
              </td>
              <td class="text-end"><button class="btn-icon" (click)="open(w); $event.stopPropagation()"><i class="ph ph-arrow-right"></i></button></td>
            </tr>
          }
          @if (workflows().length === 0) {
            <tr><td colspan="6" class="text-muted text-center py-4">No workflows defined.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class WorkflowsListComponent implements OnInit {
  private readonly api = inject(WorkflowDefApiService);
  private readonly router = inject(Router);
  readonly workflows = signal<WorkflowSummary[]>([]);

  ngOnInit(): void {
    this.api.list().subscribe((w) => this.workflows.set(w));
  }
  protected open(w: WorkflowSummary): void {
    void this.router.navigate(['/app/m/admin/workflows', w.slug]);
  }
}

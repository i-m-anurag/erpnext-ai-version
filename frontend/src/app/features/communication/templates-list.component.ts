import { Component, inject, type OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TemplateApiService, type TemplateSummary } from '../../core/api/template.api.service';

/**
 * Administration → Email Templates. Lists every template (resolved base+custom)
 * with a badge showing whether it's a shipped default or has a UI override.
 */
@Component({
  selector: 'erp-templates-list',
  imports: [],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <div class="text-muted small">Administration · Communication</div>
        <h4 class="mb-0">Email Templates</h4>
      </div>
    </div>

    <div class="erp-card p-0">
      <table class="table table-hover mb-0 align-middle iq-table">
        <thead>
          <tr><th>Template</th><th>Subject</th><th>Variables</th><th>Source</th><th></th></tr>
        </thead>
        <tbody>
          @for (t of templates(); track t.slug) {
            <tr style="cursor: pointer" (click)="open(t)">
              <td class="fw-medium"><i class="ph ph-envelope-simple text-muted me-2"></i>{{ t.slug }}</td>
              <td>{{ t.subject }}</td>
              <td>
                @for (v of t.variables; track v) { <span class="iq-chip iq-chip--info me-1">{{ v }}</span> }
              </td>
              <td>
                <span class="iq-chip" [class]="t.resolvedFrom === 'merged' ? 'iq-chip--ok' : 'iq-chip--warn'">
                  {{ t.resolvedFrom === 'merged' ? 'Customised' : 'Default' }}
                </span>
              </td>
              <td class="text-end"><button class="btn-icon" (click)="open(t); $event.stopPropagation()"><i class="ph ph-arrow-right"></i></button></td>
            </tr>
          }
          @if (templates().length === 0) {
            <tr><td colspan="5" class="text-muted text-center py-4">No templates.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class TemplatesListComponent implements OnInit {
  private readonly api = inject(TemplateApiService);
  private readonly router = inject(Router);
  readonly templates = signal<TemplateSummary[]>([]);

  ngOnInit(): void {
    this.api.list().subscribe((t) => this.templates.set(t));
  }
  protected open(t: TemplateSummary): void {
    void this.router.navigate(['/app/m/admin/communication', t.slug]);
  }
}

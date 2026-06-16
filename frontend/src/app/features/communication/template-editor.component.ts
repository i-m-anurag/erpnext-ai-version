import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { QuillEditorComponent } from 'ngx-quill';
import { TemplateApiService, type EmailTemplate } from '../../core/api/template.api.service';
import { NotificationService } from '../../core/notify/notification.service';

/** Readable sample values for the live preview (declared vars → example text). */
const SAMPLES: Record<string, string> = {
  appName: 'IQ-SMART ERP',
  userName: 'Alex Morgan',
  link: 'https://app.example.com/set-password?token=…',
  expiryHours: '24',
};

/**
 * Administration → Email Templates → editor. WYSIWYG (Quill) HTML body, a
 * merge-tag inserter for the template's declared {{variables}}, and a live
 * preview rendered with sample data. Saves to the custom scope; "Reset" reverts
 * to the shipped default.
 */
@Component({
  selector: 'erp-template-editor',
  imports: [FormsModule, RouterLink, QuillEditorComponent],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <div class="text-muted small"><a routerLink="/app/m/admin/communication">Email Templates</a> / {{ slug() }}</div>
        <h4 class="mb-0">{{ slug() }}</h4>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-light text-danger" [disabled]="saving()" (click)="reset()"><i class="ph ph-arrow-counter-clockwise"></i> Reset to default</button>
        <button class="btn btn-sm btn-primary" [disabled]="saving()" (click)="save()"><i class="ph ph-check"></i> {{ saving() ? 'Saving…' : 'Save' }}</button>
      </div>
    </div>

    @if (loaded()) {
      <div class="iq-tpl">
        <div class="iq-tpl__edit erp-card p-3">
          <label class="erp-field__label form-label">Subject</label>
          <input class="form-control mb-3" [ngModel]="subject()" (ngModelChange)="subject.set($event)" />

          <div class="d-flex align-items-center justify-content-between mb-1">
            <label class="erp-field__label form-label mb-0">Body (HTML)</label>
            @if (variables().length) {
              <div class="d-flex align-items-center gap-1">
                <span class="text-muted small">Insert:</span>
                @for (v of variables(); track v) {
                  <button type="button" class="iq-chip iq-chip--info" style="border:0;cursor:pointer" (click)="insertTag(v)">{{ '{{' }}{{ v }}{{ '}}' }}</button>
                }
              </div>
            }
          </div>
          <quill-editor [modules]="modules" [ngModel]="html()" (ngModelChange)="html.set($event)"
                        (onEditorCreated)="onEditor($event)" [styles]="{ minHeight: '240px' }" />

          <label class="erp-field__label form-label mt-3">Plain-text fallback</label>
          <textarea class="form-control" rows="3" [ngModel]="text()" (ngModelChange)="text.set($event)"></textarea>
        </div>

        <div class="iq-tpl__preview erp-card p-0">
          <div class="p-2 border-bottom small text-muted">Live preview <span class="text-muted">· sample data</span></div>
          <div class="p-2 border-bottom"><span class="text-muted small">Subject:</span> <b>{{ previewSubject() }}</b></div>
          <div class="p-3 iq-tpl__frame" [innerHTML]="previewHtml()"></div>
        </div>
      </div>
    } @else {
      <div class="erp-card p-4 text-muted"><i class="ph ph-circle-notch"></i> Loading…</div>
    }
  `,
})
export class TemplateEditorComponent {
  readonly slug = input.required<string>();

  private readonly api = inject(TemplateApiService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly loaded = signal(false);
  protected readonly saving = signal(false);
  protected readonly subject = signal('');
  protected readonly html = signal('');
  protected readonly text = signal('');
  protected readonly variables = signal<string[]>([]);

  protected readonly modules = {
    toolbar: [['bold', 'italic', 'underline'], [{ header: [1, 2, 3, false] }], [{ list: 'ordered' }, { list: 'bullet' }], ['link'], ['clean']],
  };

  private editor: { getSelection(focus?: boolean): { index: number } | null; insertText(i: number, t: string, src?: string): void } | undefined;

  constructor() {
    // route-bound input; load when slug resolves
    queueMicrotask(() => this.load());
  }

  private load(): void {
    this.api.get(this.slug()).subscribe((t: EmailTemplate) => {
      this.subject.set(t.subject);
      this.html.set(t.html);
      this.text.set(t.text ?? '');
      this.variables.set(t.variables ?? []);
      this.loaded.set(true);
    });
  }

  protected onEditor(q: unknown): void {
    this.editor = q as typeof this.editor;
  }
  protected insertTag(v: string): void {
    const tag = `{{${v}}}`;
    if (this.editor) {
      const range = this.editor.getSelection(true);
      this.editor.insertText(range ? range.index : 0, tag, 'user');
    } else {
      this.html.update((h) => h + tag);
    }
  }

  private sample(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const v of this.variables()) out[v] = SAMPLES[v] ?? `‹${v}›`;
    return out;
  }
  private substitute(s: string): string {
    const sample = this.sample();
    return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => sample[k] ?? `{{${k}}}`);
  }
  protected readonly previewSubject = computed(() => this.substitute(this.subject()));
  protected readonly previewHtml = computed(() => this.substitute(this.html()));

  protected save(): void {
    this.saving.set(true);
    this.api
      .save(this.slug(), { subject: this.subject(), html: this.html(), text: this.text(), variables: this.variables() })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notify.success('Template saved');
        },
        error: (e: { error?: { error?: { message?: string } } }) => {
          this.saving.set(false);
          this.notify.error(e?.error?.error?.message ?? 'Save failed');
        },
      });
  }

  protected reset(): void {
    if (!confirm('Reset this template to the shipped default? Your customisations will be removed.')) return;
    this.saving.set(true);
    this.api.reset(this.slug()).subscribe({
      next: () => {
        this.saving.set(false);
        this.notify.success('Reverted to default');
        this.loaded.set(false);
        this.load();
      },
      error: () => {
        this.saving.set(false);
        this.notify.error('Nothing to reset (already default)');
      },
    });
  }
}

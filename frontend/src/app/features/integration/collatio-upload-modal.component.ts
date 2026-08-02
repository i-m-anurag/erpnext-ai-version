import { Component, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { IntegrationApiService, type CollatioUploadResult } from '../../core/api/integration.api.service';

/**
 * Attach-a-document popup for the "Create using Collatio" flow. Picks a file,
 * uploads it to the Collatio OCR service via the ERP, and emits the created draft
 * record so the caller can open it. Opened by the list view when a form has
 * Collatio upload enabled.
 */
@Component({
  selector: 'erp-collatio-upload-modal',
  template: `
    <div class="modal-header">
      <h5 class="modal-title"><i class="ph-fill ph-sparkle text-ai"></i> Create using Collatio</h5>
      <button type="button" class="btn-close" (click)="modalRef.hide()"></button>
    </div>
    <div class="modal-body">
      <p class="text-muted small mb-3">
        Upload a document and Collatio's AI parser will extract it into a new draft
        {{ label }}. You can review and complete the record once extraction finishes.
      </p>

      @if (error()) { <div class="alert alert-danger py-2">{{ error() }}</div> }

      <label class="cu-drop" [class.has-file]="!!file()">
        <input type="file" class="d-none" accept="application/pdf,image/*" (change)="onFile($event)" />
        @if (file(); as f) {
          <i class="ph ph-file-text cu-drop__icon"></i>
          <div class="cu-drop__name">{{ f.name }}</div>
          <div class="text-muted small">{{ sizeKb(f) }} KB · click to change</div>
        } @else {
          <i class="ph ph-upload-simple cu-drop__icon"></i>
          <div class="cu-drop__name">Choose a file</div>
          <div class="text-muted small">PDF or image</div>
        }
      </label>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="modalRef.hide()">Cancel</button>
      <button type="button" class="btn btn-primary" [disabled]="!file() || uploading()" (click)="upload()">
        @if (uploading()) { <i class="ph ph-circle-notch"></i> Uploading… } @else { <i class="ph ph-sparkle"></i> Upload &amp; create }
      </button>
    </div>
  `,
  styles: [`
    .text-ai { color: var(--erp-ai, #9f7af3); }
    .cu-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center;
      width: 100%; padding: 28px 16px; border: 1.5px dashed #cfcfe0; border-radius: 10px; cursor: pointer; transition: border-color .15s, background .15s; }
    .cu-drop:hover { border-color: var(--erp-ai, #9f7af3); background: var(--erp-ai-tint, #f2eff8); }
    .cu-drop.has-file { border-style: solid; border-color: var(--erp-ai, #9f7af3); background: var(--erp-ai-tint, #f2eff8); }
    .cu-drop__icon { font-size: 30px; color: var(--erp-ai, #9f7af3); }
    .cu-drop__name { font-weight: 600; color: #17171a; }
  `],
})
export class CollatioUploadModalComponent {
  /** Target form slug (set by the opener). */
  slug = '';
  /** Human label for the created record type, e.g. "requisition". */
  label = 'record';
  /** Emits once on a successful upload. */
  readonly uploaded = new Subject<CollatioUploadResult>();

  protected readonly file = signal<File | null>(null);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly api = inject(IntegrationApiService);
  constructor(public readonly modalRef: BsModalRef) {}

  protected onFile(e: Event): void {
    this.file.set((e.target as HTMLInputElement).files?.[0] ?? null);
    this.error.set(null);
  }
  protected sizeKb(f: File): number {
    return Math.max(1, Math.round(f.size / 1024));
  }
  protected upload(): void {
    const f = this.file();
    if (!f || this.uploading()) return;
    this.uploading.set(true);
    this.error.set(null);
    this.api.collatioUpload(this.slug, f).subscribe({
      next: (r) => {
        this.uploading.set(false);
        this.uploaded.next(r);
        this.modalRef.hide();
      },
      error: (e: { error?: { error?: { message?: string } } }) => {
        this.uploading.set(false);
        this.error.set(e?.error?.error?.message ?? 'Upload failed');
      },
    });
  }
}

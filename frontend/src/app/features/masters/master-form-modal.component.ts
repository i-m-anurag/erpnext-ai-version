import { Component, inject, type OnInit, signal } from '@angular/core';
import { type FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { DynamicFormComponent } from '../../dynamic-form/dynamic-form.component';
import { FormBuilderService } from '../../dynamic-form/form-builder.service';
import { FormApiService } from '../../core/api/form.api.service';
import { MasterApiService } from '../../core/api/master.api.service';
import { NotificationService } from '../../core/notify/notification.service';
import type { FormDefinition } from '../../core/models/api.models';

/**
 * Modal that renders a master's form (via the dynamic-form engine) for create or
 * edit, validates against the resolved form definition, and saves through the
 * master-data API. Emits `saved` so the list refreshes.
 */
@Component({
  selector: 'erp-master-form-modal',
  imports: [DynamicFormComponent],
  template: `
    <div class="modal-header">
      <h5 class="modal-title">{{ rowId ? 'Edit' : 'Add' }} {{ title }}</h5>
      <button type="button" class="btn-close" (click)="modalRef.hide()"></button>
    </div>
    <div class="modal-body">
      @if (error()) {
        <div class="alert alert-danger py-2">{{ error() }}</div>
      }
      @if (config() && group()) {
        <erp-dynamic-form [config]="config()!" [group]="group()!" (submitted)="onSubmit()">
          <button type="button" class="btn btn-light" (click)="modalRef.hide()">Cancel</button>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Save' }}
          </button>
        </erp-dynamic-form>
      } @else {
        <div class="text-muted">Loading…</div>
      }
    </div>
  `,
})
export class MasterFormModalComponent implements OnInit {
  // Set via BsModalService initialState:
  masterSlug!: string;
  formSlug!: string;
  title = 'record';
  rowId?: string;
  initialData?: Record<string, unknown>;

  readonly saved = new Subject<void>();
  readonly config = signal<FormDefinition | null>(null);
  readonly group = signal<FormGroup | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  private readonly formApi = inject(FormApiService);
  private readonly fb = inject(FormBuilderService);
  private readonly api = inject(MasterApiService);
  private readonly notify = inject(NotificationService);
  readonly modalRef = inject(BsModalRef);

  ngOnInit(): void {
    this.formApi.getForm(this.formSlug).subscribe((def) => {
      this.config.set(def);
      const group = this.fb.build(def);
      if (this.initialData) group.patchValue(this.initialData);
      this.group.set(group);
    });
  }

  onSubmit(): void {
    const group = this.group();
    if (!group) return;
    if (group.invalid) {
      group.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const data = group.value as Record<string, unknown>;
    const op = this.rowId
      ? this.api.updateData(this.masterSlug, this.rowId, data)
      : this.api.createData(this.masterSlug, data);
    op.subscribe({
      next: () => {
        this.notify.success(`${this.title} ${this.rowId ? 'updated' : 'created'}`);
        this.saved.next();
        this.modalRef.hide();
      },
      error: (e: { error?: { error?: { message?: string } } }) => {
        const msg = e?.error?.error?.message ?? 'Save failed';
        this.error.set(msg);
        this.notify.error(msg);
        this.saving.set(false);
      },
    });
  }
}

import { Component, inject } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { type FormGroup } from '@angular/forms';
import { TabsModule } from 'ngx-bootstrap/tabs';
import { AccordionModule } from 'ngx-bootstrap/accordion';
import { DynamicFormComponent } from '../../dynamic-form/dynamic-form.component';
import { FormBuilderService } from '../../dynamic-form/form-builder.service';
import { NotificationService } from '../../core/notify/notification.service';
import type { FormDefinition } from '../../core/models/api.models';

/**
 * Developer showcase (not an ERP feature). Demonstrates the dynamic-form engine:
 * every field type, single/two-column layouts, the same component reused across
 * MULTIPLE form groups inside tabs and an accordion, live form values, and the
 * notification/loader add-ons.
 */
@Component({
  selector: 'erp-playground',
  imports: [DynamicFormComponent, JsonPipe, TabsModule, AccordionModule],
  template: `
    <h4 class="mb-1">Dynamic Form Playground</h4>
    <p class="text-muted">A reference of what the dynamic-form engine can render. Not part of the ERP.</p>

    <!-- Notifications demo -->
    <div class="erp-card p-3 mb-3">
      <div class="fw-semibold mb-2">Notifications (toastr)</div>
      <div class="d-flex flex-wrap gap-2">
        <button class="btn btn-sm btn-success" (click)="notify.success('Saved successfully')">Success</button>
        <button class="btn btn-sm btn-danger" (click)="notify.error('Something went wrong')">Error</button>
        <button class="btn btn-sm btn-info" (click)="notify.info('Heads up — info message')">Info</button>
        <button class="btn btn-sm btn-warning" (click)="notify.warning('Careful with this')">Warning</button>
        <button class="btn btn-sm btn-outline-secondary" (click)="fireMany()">Fire 3 at once</button>
      </div>
    </div>

    <tabset>
      <tab heading="All field types">
        <div class="row mt-3">
          <div class="col-lg-7">
            <erp-dynamic-form [config]="allConfig" [group]="allGroup" />
          </div>
          <div class="col-lg-5">
            <div class="fw-semibold small text-muted mb-1">Live value</div>
            <pre class="erp-card p-2 small mb-0">{{ allGroup.value | json }}</pre>
          </div>
        </div>
      </tab>

      <tab heading="Two-column layout">
        <div class="row mt-3">
          <div class="col-lg-7"><erp-dynamic-form [config]="twoColConfig" [group]="twoColGroup" /></div>
          <div class="col-lg-5">
            <div class="fw-semibold small text-muted mb-1">Live value</div>
            <pre class="erp-card p-2 small mb-0">{{ twoColGroup.value | json }}</pre>
          </div>
        </div>
      </tab>

      <tab heading="Accordion · multiple form groups">
        <div class="row mt-3">
          <div class="col-lg-7">
            <accordion [closeOthers]="false">
              <accordion-group heading="Personal" [isOpen]="true">
                <erp-dynamic-form [config]="personalConfig" [group]="personalGroup" />
              </accordion-group>
              <accordion-group heading="Address">
                <erp-dynamic-form [config]="addressConfig" [group]="addressGroup" />
              </accordion-group>
            </accordion>
          </div>
          <div class="col-lg-5">
            <div class="fw-semibold small text-muted mb-1">Combined value (two groups)</div>
            <pre class="erp-card p-2 small mb-0">{{ combined() | json }}</pre>
            <button class="btn btn-sm btn-primary mt-2" (click)="validateAll()">Validate all</button>
          </div>
        </div>
      </tab>
    </tabset>
  `,
})
export class PlaygroundComponent {
  protected readonly notify = inject(NotificationService);
  private readonly fb = inject(FormBuilderService);

  protected readonly allConfig: FormDefinition = {
    slug: 'demo-all',
    title: 'All field types',
    layout: 'single-column',
    fields: [
      { key: 'text', type: 'text', label: 'Text', required: true, placeholder: 'Type something…', validators: { minLength: 2 } },
      { key: 'password', type: 'password', label: 'Password' },
      { key: 'number', type: 'number', label: 'Number', validators: { min: 0, max: 100 } },
      { key: 'notes', type: 'textarea', label: 'Textarea' },
      { key: 'select', type: 'select', label: 'Select', options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }] },
      { key: 'multi', type: 'multiselect', label: 'Multi-select', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }, { value: 'z', label: 'Z' }] },
      { key: 'country', type: 'master-lookup', label: 'Country (master-lookup)', optionsSource: { master: 'country' } },
      { key: 'date', type: 'date', label: 'Date' },
      { key: 'agree', type: 'checkbox', label: 'I agree to the terms' },
    ],
  };

  protected readonly twoColConfig: FormDefinition = {
    slug: 'demo-two',
    title: 'Two column',
    layout: 'two-column',
    fields: [
      { key: 'firstName', type: 'text', label: 'First name', required: true },
      { key: 'lastName', type: 'text', label: 'Last name', required: true },
      { key: 'email', type: 'text', label: 'Email', validators: { pattern: '^[^@]+@[^@]+\\.[^@]+$' } },
      { key: 'phone', type: 'text', label: 'Phone' },
    ],
  };

  protected readonly personalConfig: FormDefinition = {
    slug: 'demo-personal',
    title: 'Personal',
    layout: 'two-column',
    fields: [
      { key: 'name', type: 'text', label: 'Full name', required: true },
      { key: 'dob', type: 'date', label: 'Date of birth' },
    ],
  };

  protected readonly addressConfig: FormDefinition = {
    slug: 'demo-address',
    title: 'Address',
    layout: 'single-column',
    fields: [
      { key: 'line1', type: 'text', label: 'Address line', required: true },
      { key: 'city', type: 'text', label: 'City' },
      { key: 'country', type: 'master-lookup', label: 'Country', optionsSource: { master: 'country' } },
    ],
  };

  protected readonly allGroup: FormGroup = this.fb.build(this.allConfig);
  protected readonly twoColGroup: FormGroup = this.fb.build(this.twoColConfig);
  protected readonly personalGroup: FormGroup = this.fb.build(this.personalConfig);
  protected readonly addressGroup: FormGroup = this.fb.build(this.addressConfig);

  protected combined(): unknown {
    return { personal: this.personalGroup.value, address: this.addressGroup.value };
  }

  protected validateAll(): void {
    this.personalGroup.markAllAsTouched();
    this.addressGroup.markAllAsTouched();
    const ok = this.personalGroup.valid && this.addressGroup.valid;
    if (ok) this.notify.success('Both groups are valid');
    else this.notify.error('Fix the highlighted fields in both groups');
  }

  protected fireMany(): void {
    this.notify.info('First message');
    this.notify.warning('Second message');
    this.notify.success('Third message');
  }
}

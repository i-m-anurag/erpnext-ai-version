import { Component, inject, type OnInit, signal } from '@angular/core';
import { type FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { DynamicFormComponent } from '../../dynamic-form/dynamic-form.component';
import { FormBuilderService } from '../../dynamic-form/form-builder.service';
import { FormApiService } from '../../core/api/form.api.service';
import { AuthService } from '../../core/auth/auth.service';
import { AuthStore } from '../../core/state/auth.store';
import type { FormDefinition } from '../../core/models/api.models';

/** Used if the public login form can't be fetched (API down) — login stays usable. */
const FALLBACK_LOGIN: FormDefinition = {
  slug: 'login',
  title: 'Sign in',
  layout: 'single-column',
  fields: [
    { key: 'username', type: 'text', label: 'Username', required: true },
    { key: 'password', type: 'password', label: 'Password', required: true },
  ],
};

@Component({
  selector: 'erp-login',
  imports: [DynamicFormComponent],
  template: `
    <div class="erp-login">
      <div class="erp-card erp-login__card">
        <div class="erp-login__brand">{{ config()?.title ?? 'Sign in' }}</div>
        @if (error()) {
          <div class="alert alert-danger py-2">{{ error() }}</div>
        }
        @if (config() && group()) {
          <erp-dynamic-form [config]="config()!" [group]="group()!" (submitted)="onSubmit()">
            <button type="submit" class="btn btn-primary w-100" [disabled]="submitting()">
              {{ submitting() ? 'Signing in…' : 'Sign in' }}
            </button>
          </erp-dynamic-form>
        } @else {
          <div class="text-center text-muted">Loading…</div>
        }
      </div>
    </div>
  `,
})
export class LoginComponent implements OnInit {
  private readonly formApi = inject(FormApiService);
  private readonly fb = inject(FormBuilderService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly store = inject(AuthStore);

  readonly config = signal<FormDefinition | null>(null);
  readonly group = signal<FormGroup | null>(null);
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  ngOnInit(): void {
    if (this.store.isAuthenticated()) {
      void this.router.navigate(['/app']);
      return;
    }
    // The login form is a configurable PUBLIC form; fall back to a local config
    // if the API is unreachable so the screen always renders.
    this.formApi
      .getPublicForm('login')
      .pipe(catchError(() => of(FALLBACK_LOGIN)))
      .subscribe((def) => {
        this.config.set(def);
        this.group.set(this.fb.build(def));
      });
  }

  onSubmit(): void {
    const group = this.group();
    if (!group) return;
    if (group.invalid) {
      group.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    const { username, password } = group.value as { username: string; password: string };
    this.auth.login(username, password).subscribe({
      next: () => void this.router.navigate(['/app']),
      error: (e: { error?: { error?: { message?: string } } }) => {
        this.error.set(e?.error?.error?.message ?? 'Login failed. Check your credentials.');
        this.submitting.set(false);
      },
    });
  }
}

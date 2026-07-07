/**
 * Per-form business logic on the client — the browser-side companion to the Node
 * FormController. The generic record view is form-agnostic; anything specific to
 * ONE form (how its status badge looks, extra header actions) lives in a
 * FormController registered for that master slug, instead of piling `if (slug…)`
 * branches into the one record-view component.
 *
 * The server stays authoritative for what a status *is* (it computes + persists
 * `state`); the client controller only decides how to PRESENT it and what extra
 * buttons to offer.
 */

/** The record the controller reasons about (mirrors the backend FormDoc). */
export interface FormRecord {
  slug: string;
  code: string;
  data: Record<string, unknown>;
  /** Lifecycle status: 'draft' | 'active' | 'archived'. */
  status: string;
  /** Business state persisted by the server-side controller. */
  state: string | null;
}

export type BadgeTone = 'default' | 'info' | 'success' | 'warn' | 'danger';

/** How to render the record's status badge. */
export interface StatusBadge {
  label: string;
  tone?: BadgeTone;
}

/** Services handed to an action when it runs (kept tiny to avoid Angular DI here). */
export interface FormActionCtx {
  notify: (message: string) => void;
  /** Re-fetch the record + panels. */
  reload: () => void;
}

/** A custom header button contributed by a form controller. */
export interface FormAction {
  key: string;
  label: string;
  icon?: string;
  run(record: FormRecord, ctx: FormActionCtx): void | Promise<void>;
}

export interface FormController {
  /** Override the displayed status badge. Return undefined to fall back to the
   *  raw state/status text. */
  status?(record: FormRecord): StatusBadge | undefined;
  /** Extra action buttons for the record header (e.g. form-specific operations). */
  actions?(record: FormRecord): FormAction[];
}

const registry = new Map<string, FormController>();

/** Register the client-side controller for a master/document slug. */
export function registerFormController(slug: string, controller: FormController): void {
  registry.set(slug, controller);
}

/** The controller for a slug, or undefined when the form has no custom logic. */
export function getFormController(slug: string): FormController | undefined {
  return registry.get(slug);
}

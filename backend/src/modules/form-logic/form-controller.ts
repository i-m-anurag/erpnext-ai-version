import type { EntityManager } from 'typeorm';

/**
 * Per-form business logic ("controllers"), the server-side equivalent of ERPNext
 * DocType controllers. The generic master/document save path is form-agnostic;
 * anything specific to ONE form (deriving a status, computing a field, reacting to
 * a save) lives in a FormController registered for that master slug — so the one
 * generic service never accumulates per-form `if (slug === …)` branches.
 *
 * Hooks fire around the generic persist in master.service:
 *   beforeSave → (persist) → computeStatus → (write state) → afterSave
 */

/** A snapshot of a just-persisted record handed to computeStatus / afterSave. */
export interface FormDoc {
  slug: string;
  id: string;
  code: string;
  /** The persisted field values (incl. line-items). */
  data: Record<string, unknown>;
  /** Lifecycle status: 'draft' | 'active' | 'archived'. */
  status: string;
  /** Business state/status column (what computeStatus derives). */
  state: string | null;
}

/** Mutable pre-persist context. Mutating `input` changes what gets saved; throwing
 *  rejects the save with the thrown error. */
export interface BeforeSaveCtx {
  slug: string;
  /** The incoming field values — mutate in place to adjust what is persisted. */
  input: Record<string, unknown>;
  /** True for "Save as draft" (validation skipped), false for a full submit. */
  draft: boolean;
  /** True on create, false on update. */
  isNew: boolean;
  /** The acting user, when known. */
  actorUserId?: string;
}

/** Post-persist context. For document saves, `manager` is the open transaction the
 *  record was persisted on — hand it to ledgerService.post so the GL entries commit
 *  or roll back atomically WITH the document. Undefined for non-transactional saves. */
export interface AfterSaveCtx {
  manager?: EntityManager;
}

export interface FormController {
  /** Adjust or validate the input before it is persisted. Throw to reject. */
  beforeSave?(ctx: BeforeSaveCtx): void | Promise<void>;
  /** Derive the business status/state from the saved record. Return the new state,
   *  or null to leave the current state unchanged. Pure — do not mutate. */
  computeStatus?(doc: FormDoc): string | null;
  /** React after the record (and any derived state) is persisted — side effects,
   *  linked-document updates, activity/timeline entries, notifications. */
  afterSave?(doc: FormDoc, tx?: AfterSaveCtx): void | Promise<void>;
  /** React after the record is reversed/cancelled — the mirror of afterSave, for
   *  undoing whatever it did to OTHER documents (afterSave's ledger effects are
   *  reversed by the cancel path itself). Runs on the cancellation's transaction. */
  afterReverse?(doc: FormDoc, tx?: AfterSaveCtx): void | Promise<void>;
}

const registry = new Map<string, FormController>();

/** Register the business-logic controller for a master/document slug. */
export function registerFormController(slug: string, controller: FormController): void {
  if (registry.has(slug)) throw new Error(`form controller already registered: ${slug}`);
  registry.set(slug, controller);
}

/** The controller for a slug, or undefined when the form has no custom logic. */
export function getFormController(slug: string): FormController | undefined {
  return registry.get(slug);
}

import { z } from 'zod';

/**
 * JSON form-definition schema (§5.1). This validates the EFFECTIVE (base+override
 * merged) definition resolved by the config pipeline, so the API never trusts a
 * malformed form. The Angular renderer (Phase 2) consumes the same shape.
 */
export const fieldTypeSchema = z.enum([
  'text',
  'password',
  'textarea',
  'number',
  'select',
  'multiselect',
  'date',
  'checkbox',
  'file',
  'master-lookup',
  'table',
]);

/**
 * A single form field. `type: 'table'` makes it a tabular sub-form whose rows are
 * validated against `columns` (themselves FormFields) — so the type is recursive.
 */
export interface FormField {
  key: string;
  type: z.infer<typeof fieldTypeSchema>;
  label: string;
  required?: boolean;
  placeholder?: string;
  validators?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
  };
  visibleWhen?: { field: string; equals: unknown };
  optionsSource?: { master: string };
  options?: { value: string; label: string }[];
  columns?: FormField[];
  minRows?: number;
  maxRows?: number;
  auto?: boolean;
  /** Controls visibility as a column in the record list view (see resolver). */
  inList?: boolean;
}

export const formFieldSchema: z.ZodType<FormField> = z.lazy(() =>
  z.object({
    key: z.string().min(1),
    type: fieldTypeSchema,
    label: z.string().min(1),
    required: z.boolean().optional(),
    placeholder: z.string().optional(),
    /** Validation rules applied on both ends (generated into server-side checks later). */
    validators: z
      .object({
        minLength: z.number().int().optional(),
        maxLength: z.number().int().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        pattern: z.string().optional(),
      })
      .optional(),
    /** Conditional visibility: show when another field equals a value. */
    visibleWhen: z.object({ field: z.string(), equals: z.unknown() }).optional(),
    /** Options sourced from a master (resolved server-side) … */
    optionsSource: z.object({ master: z.string() }).optional(),
    /** … or inline static options. */
    options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
    /** type: 'table' — per-row column fields (a nested form definition). */
    columns: z.array(formFieldSchema).optional(),
    minRows: z.number().int().nonnegative().optional(),
    maxRows: z.number().int().positive().optional(),
    /** server-filled (naming series) — read-only in the UI */
    auto: z.boolean().optional(),
    /** list-view column visibility (opt-out default / opt-in if any field sets true) */
    inList: z.boolean().optional(),
  }),
);

export const formDefinitionSchema = z.object({
  slug: z.string().min(1),
  version: z.number().int().positive().optional(),
  title: z.string().min(1),
  layout: z.enum(['single-column', 'two-column']).default('single-column'),
  /**
   * Whether this form may be fetched WITHOUT authentication (e.g. the login form).
   * Default false — forms are private and require auth + `form:view`. Public forms
   * are served only by GET /api/public/forms/:slug and must be self-contained
   * (no authed master-lookups).
   */
  public: z.boolean().default(false),
  fields: z.array(formFieldSchema),
});

export type FormDefinition = z.infer<typeof formDefinitionSchema>;

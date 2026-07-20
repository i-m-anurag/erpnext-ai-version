/** Response shapes from the backend API (mirror the OpenAPI schemas). */

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  status: string;
  isFirstLogin: boolean;
}

export interface LoginResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  user: PublicUser;
}

export interface RefreshResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
}

export interface MeResponse {
  user: PublicUser;
  permissions: string[];
  branchId: string | null;
}

export interface Branding {
  productName: string;
  logoUrl: string;
}

export interface MetaResponse {
  name: string;
  env: string;
  modules: Record<string, boolean>;
  branding?: Branding;
}

/** A resolved form definition (public or authed endpoint). */
export interface FormFieldDef {
  key: string;
  type: string;
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
  /** Server-derived value (arithmetic over sibling fields) — rendered read-only. */
  calculate?: { expression: string; precision?: number };
  /** Pre-fill for a new record; supports the "$today" and "$nowTime" tokens. */
  defaultValue?: unknown;
  readOnly?: boolean;
  editable?: boolean;
  showRowActions?: boolean;
  options?: { value: string; label: string }[];
  /** Optional css.json variant slug for this field's wrapper (e.g. "col2"). */
  cssSlug?: string;
  /** Auto-filled by the server (e.g. a naming-series id) → rendered read-only. */
  auto?: boolean;
  /**
   * Controls whether this field appears as a column in the record list view.
   * Two modes (decided per-form by the resolver):
   *  • opt-out (default): all scalar fields show; set `inList: false` to hide one.
   *  • opt-in: if ANY field sets `inList: true`, ONLY those fields show (curated list).
   * The code field is always shown regardless.
   */
  inList?: boolean;
  /** For type === 'table': the per-row column field definitions (a nested form). */
  columns?: FormFieldDef[];
  /** For type === 'group': the nested sub-fields. */
  fields?: FormFieldDef[];
  /**
   * For type === 'group'. Two flavours share this type:
   *  • nested:true  → DATA group: children live under a sub-object, stored as one
   *    jsonb column (own nested FormGroup, rendered by GroupFieldComponent).
   *  • nested:false/omitted → DISPLAY group: a collapsible accordion section;
   *    children are flattened to the parent (normal top-level fields/columns).
   */
  nested?: boolean;
  /** display group: show the collapse toggle (default true). */
  collapsible?: boolean;
  /** display group: start collapsed. */
  defaultCollapsed?: boolean;
  /** group body layout override (defaults to the form layout). */
  layout?: 'single-column' | 'two-column';
  /** checkbox: fields whose visibility this control drives when (un)checked. */
  effects?: { checked?: { showFields?: string[] }; unchecked?: { showFields?: string[] } };
  /** For type === 'table': min/max number of rows (min enforced, max caps "Add row"). */
  minRows?: number;
  maxRows?: number;
}

/**
 * Flatten a field tree to its EFFECTIVE data fields: display groups (`type:'group'`
 * without `nested:true`) are transparent — their children pull up to the parent.
 * Data groups (`nested:true`) stay a single `group` field. Mirrors the backend
 * `flattenDataFields` so list columns and outbound coercion agree on the shape.
 */
export function flattenDataFields(fields: FormFieldDef[]): FormFieldDef[] {
  const out: FormFieldDef[] = [];
  for (const f of fields) {
    if (f.type === 'group' && f.nested !== true) out.push(...flattenDataFields(f.fields ?? []));
    else out.push(f);
  }
  return out;
}

export interface MasterOption {
  value: string;
  label: string;
}

export interface MasterRegistry {
  id: string;
  slug: string;
  name: string;
  managedBy: 'seeded' | 'ui';
  editable: boolean;
  formSlug: string | null;
  codeField: string;
  labelField: string;
  cacheTtlSeconds: number;
  status: string;
  /** count of active rows (registry list endpoint only). */
  rowCount?: number;
}

export interface MasterRow {
  id: string;
  masterSlug: string;
  code: string;
  data: Record<string, unknown>;
  status: string;
  /** Business state derived by the form controller / workflow (null = none). */
  state?: string | null;
}

export interface FormDefinition {
  slug: string;
  version?: number;
  title: string;
  layout: 'single-column' | 'two-column';
  public?: boolean;
  fields: FormFieldDef[];
}

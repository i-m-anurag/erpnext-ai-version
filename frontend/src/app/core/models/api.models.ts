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
  options?: { value: string; label: string }[];
  /** Optional css.json variant slug for this field's wrapper (e.g. "col2"). */
  cssSlug?: string;
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
}

export interface FormDefinition {
  slug: string;
  version?: number;
  title: string;
  layout: 'single-column' | 'two-column';
  public?: boolean;
  fields: FormFieldDef[];
}

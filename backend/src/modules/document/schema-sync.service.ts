import { AppDataSource } from '../../db/data-source.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { configResolver } from '../config/index.js';
import { FORM_RESOURCE_TYPE, flattenDataFields, type FormDefinition } from '../form/index.js';
import type { FormField } from '../form/form.schema.js';
import { MasterRegistry } from '../master/master-registry.entity.js';
import { tableNameForSlug } from './table-name.js';

/** Columns the engine owns on every document table (never generated from fields). */
const RESERVED = new Set([
  'id',
  'code',
  'state',
  'status',
  'extra',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'parent_id',
  'idx',
]);

export interface SyncResult {
  table: string;
  changes: string[];
  warnings: string[];
}

/** Quote + validate an SQL identifier (field keys come from JSON — be strict). */
function ident(name: string): string {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) throw new Error(`unsafe identifier: ${name}`);
  return `"${name}"`;
}

/** Map a form field to a Postgres column type. */
export function pgType(field: Pick<FormField, 'type'>): string {
  switch (field.type) {
    case 'number':
      return 'numeric';
    case 'checkbox':
      return 'boolean';
    case 'date':
      return 'timestamptz';
    case 'multiselect':
    case 'group': // nested sub-object stored whole
      return 'jsonb';
    default:
      return 'text'; // text, select, master-lookup, textarea, password, file
  }
}

interface ColumnSpec {
  name: string;
  type: string;
}

/**
 * Generates / evolves the dedicated tables for `document` entities from their form
 * JSON. Additive only: creates missing tables and adds missing columns; never
 * drops or retypes (those are reported as warnings for a manual migration).
 */
export class SchemaSyncService {
  private readonly registry = new BaseRepository(MasterRegistry);

  /** Sync every document entity. Returns per-table change/warning logs. */
  async syncAll(): Promise<SyncResult[]> {
    const regs = await this.registry.find({ where: { kind: 'document' } });
    const out: SyncResult[] = [];
    for (const reg of regs) {
      if (!reg.formSlug) continue;
      const form = (await configResolver.resolve<FormDefinition>(FORM_RESOURCE_TYPE, reg.formSlug)).definition;
      out.push(await this.syncEntity(reg.slug, reg.codeField, reg.tableName ?? tableNameForSlug(reg.slug), form));
    }
    return out;
  }

  async syncEntity(slug: string, codeField: string, parent: string, form: FormDefinition): Promise<SyncResult> {
    const res: SyncResult = { table: parent, changes: [], warnings: [] };

    // Flatten display groups so their children become real columns; data groups
    // (nested:true) stay a single field → one jsonb column.
    const effective = flattenDataFields(form.fields);

    // Parent: reserved columns + a typed column per scalar field (minus the code field).
    const scalarCols = effective
      .filter((f) => f.type !== 'table' && f.key !== codeField && !RESERVED.has(f.key))
      .map<ColumnSpec>((f) => ({ name: f.key, type: pgType(f) }));
    await this.ensureParent(parent, scalarCols, res);

    // Children: one table per `table` (line-item) field.
    for (const f of effective.filter((f) => f.type === 'table')) {
      const child = `${parent}__${f.key.toLowerCase()}`;
      const cols = (f.columns ?? [])
        .filter((c) => !RESERVED.has(c.key))
        .map<ColumnSpec>((c) => ({ name: c.key, type: pgType(c) }));
      await this.ensureChild(child, parent, cols, res);
    }
    return res;
  }

  private async existingColumns(table: string): Promise<Set<string>> {
    const rows = (await AppDataSource.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
      [table],
    )) as Array<{ column_name: string }>;
    return new Set(rows.map((r) => r.column_name));
  }

  private async tableExists(table: string): Promise<boolean> {
    const rows = (await AppDataSource.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [table],
    )) as unknown[];
    return rows.length > 0;
  }

  private async ensureParent(table: string, cols: ColumnSpec[], res: SyncResult): Promise<void> {
    if (!(await this.tableExists(table))) {
      const colDdl = cols.map((c) => `  ${ident(c.name)} ${c.type}`).join(',\n');
      await AppDataSource.query(`
        CREATE TABLE ${ident(table)} (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "code" character varying(128) NOT NULL,
          "state" character varying(48),
          "status" character varying(16) NOT NULL DEFAULT 'active',
          "extra" jsonb NOT NULL DEFAULT '{}',
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now(),
          "deletedAt" timestamptz${colDdl ? ',\n' + colDdl : ''},
          CONSTRAINT ${ident('PK_' + table)} PRIMARY KEY ("id"),
          CONSTRAINT ${ident('UQ_' + table + '_code')} UNIQUE ("code")
        )`);
      res.changes.push(`CREATE TABLE ${table} (${cols.length} field columns)`);
      return;
    }
    await this.addMissing(table, cols, res);
  }

  private async ensureChild(table: string, parent: string, cols: ColumnSpec[], res: SyncResult): Promise<void> {
    if (!(await this.tableExists(table))) {
      const colDdl = cols.map((c) => `  ${ident(c.name)} ${c.type}`).join(',\n');
      await AppDataSource.query(`
        CREATE TABLE ${ident(table)} (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "parent_id" uuid NOT NULL,
          "idx" integer NOT NULL DEFAULT 0${colDdl ? ',\n' + colDdl : ''},
          CONSTRAINT ${ident('PK_' + table)} PRIMARY KEY ("id"),
          CONSTRAINT ${ident('FK_' + table)} FOREIGN KEY ("parent_id") REFERENCES ${ident(parent)}("id") ON DELETE CASCADE
        )`);
      await AppDataSource.query(`CREATE INDEX ${ident('idx_' + table + '_parent')} ON ${ident(table)} ("parent_id")`);
      res.changes.push(`CREATE TABLE ${table} (child, ${cols.length} columns)`);
      return;
    }
    await this.addMissing(table, cols, res);
  }

  /** Add any columns present in the form but missing in the table (additive only). */
  private async addMissing(table: string, cols: ColumnSpec[], res: SyncResult): Promise<void> {
    const existing = await this.existingColumns(table);
    for (const c of cols) {
      if (!existing.has(c.name)) {
        await AppDataSource.query(`ALTER TABLE ${ident(table)} ADD COLUMN ${ident(c.name)} ${c.type}`);
        res.changes.push(`ALTER ${table} ADD ${c.name} ${c.type}`);
      }
    }
    // Report (don't apply) columns in the table that the form no longer declares.
    const desired = new Set([...cols.map((c) => c.name), ...RESERVED]);
    for (const name of existing) {
      if (!desired.has(name)) res.warnings.push(`${table}.${name} exists but is not in the form (left as-is)`);
    }
  }
}

export const schemaSyncService = new SchemaSyncService();

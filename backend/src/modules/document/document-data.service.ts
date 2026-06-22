import { AppDataSource } from '../../db/data-source.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import { configResolver } from '../config/index.js';
import { FORM_RESOURCE_TYPE, validateFormData, type FormDefinition } from '../form/index.js';
import type { FormField } from '../form/form.schema.js';
import { MasterRegistry } from '../master/master-registry.entity.js';
import { tableNameForSlug } from './table-name.js';
import { namingSeriesService } from '../naming/index.js';

const RESERVED = new Set(['id', 'code', 'state', 'status', 'extra', 'createdAt', 'updatedAt', 'deletedAt', 'parent_id', 'idx']);

function ident(name: string): string {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) throw new Error(`unsafe identifier: ${name}`);
  return `"${name}"`;
}

type Sql = Record<string, unknown>;

export interface DocumentRow {
  id: string;
  masterSlug: string;
  code: string;
  data: Record<string, unknown>;
  status: string;
  state: string | null;
}

interface Ctx {
  slug: string;
  form: FormDefinition;
  table: string;
  codeField: string;
  scalar: FormField[];
  tables: FormField[];
}

/**
 * CRUD for `document` entities backed by a dedicated table (+ child tables for
 * line items). Scalar fields are real columns, the long tail goes to `extra`
 * (jsonb), and line-item fields are child rows. Returns the same shape as the
 * master-data store so the views/resolver work unchanged.
 */
export class DocumentDataService {
  private readonly registry = new BaseRepository(MasterRegistry);

  private async ctx(slug: string): Promise<Ctx> {
    const reg = await this.registry.findOne({ slug });
    if (!reg) throw new NotFoundError(`master not found: ${slug}`);
    if (reg.kind !== 'document') throw new BadRequestError(`${slug} is not a document`);
    if (!reg.formSlug) throw new BadRequestError(`${slug} has no form`);
    const form = (await configResolver.resolve<FormDefinition>(FORM_RESOURCE_TYPE, reg.formSlug)).definition;
    return {
      slug,
      form,
      table: reg.tableName ?? tableNameForSlug(slug),
      codeField: reg.codeField,
      scalar: form.fields.filter((f) => f.type !== 'table' && f.key !== reg.codeField && !RESERVED.has(f.key)),
      tables: form.fields.filter((f) => f.type === 'table'),
    };
  }

  async list(slug: string, limit = 200, offset = 0): Promise<DocumentRow[]> {
    const c = await this.ctx(slug);
    const rows = (await AppDataSource.query(
      `SELECT * FROM ${ident(c.table)} WHERE "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT $1 OFFSET $2`,
      [Math.min(limit, 500), offset],
    )) as Sql[];
    return Promise.all(rows.map((r) => this.assemble(c, r)));
  }

  async getById(slug: string, id: string): Promise<DocumentRow> {
    const c = await this.ctx(slug);
    const rows = (await AppDataSource.query(
      `SELECT * FROM ${ident(c.table)} WHERE "id"=$1 AND "deletedAt" IS NULL`,
      [id],
    )) as Sql[];
    if (rows.length === 0) throw new NotFoundError('document not found');
    return this.assemble(c, rows[0]!);
  }

  async create(slug: string, input: Record<string, unknown>): Promise<DocumentRow> {
    const c = await this.ctx(slug);
    const auto = await namingSeriesService.next(slug);
    const clean = validateFormData(c.form, auto ? { ...input, [c.codeField]: auto } : input);
    const code = String(clean[c.codeField] ?? '');
    if (!code) throw new BadRequestError(`missing ${c.codeField}`);

    const { cols, vals, extra } = this.split(c, clean);
    const names = ['"code"', '"extra"', ...cols.map(ident)];
    const placeholders = ['$1', '$2::jsonb', ...vals.map((_, i) => `$${i + 3}`)];
    const params = [code, JSON.stringify(extra), ...vals];
    const inserted = (await AppDataSource.query(
      `INSERT INTO ${ident(c.table)} (${names.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      params,
    )) as Sql[];
    const row = inserted[0]!;
    await this.insertChildren(c, String(row.id), clean);
    return this.assemble(c, row);
  }

  async update(slug: string, id: string, input: Record<string, unknown>): Promise<DocumentRow> {
    const c = await this.ctx(slug);
    const existing = (await AppDataSource.query(`SELECT "code" FROM ${ident(c.table)} WHERE "id"=$1`, [id])) as Sql[];
    if (existing.length === 0) throw new NotFoundError('document not found');
    const code = String(existing[0]!.code);
    const clean = validateFormData(c.form, { ...input, [c.codeField]: code });

    const { cols, vals, extra } = this.split(c, clean);
    const sets = ['"extra"=$1::jsonb', '"updatedAt"=now()', ...cols.map((cn, i) => `${ident(cn)}=$${i + 2}`)];
    const params = [JSON.stringify(extra), ...vals, id];
    await AppDataSource.query(`UPDATE ${ident(c.table)} SET ${sets.join(', ')} WHERE "id"=$${params.length}`, params);

    for (const tf of c.tables) {
      await AppDataSource.query(`DELETE FROM ${ident(`${c.table}__${tf.key.toLowerCase()}`)} WHERE "parent_id"=$1`, [id]);
    }
    await this.insertChildren(c, id, clean);
    return this.getById(slug, id);
  }

  async remove(slug: string, id: string): Promise<void> {
    const c = await this.ctx(slug);
    await AppDataSource.query(`UPDATE ${ident(c.table)} SET "deletedAt"=now(), "status"='archived' WHERE "id"=$1`, [id]);
  }

  /** Options for a document master-lookup (value=code, label=labelField/first scalar). */
  async options(slug: string): Promise<{ value: string; label: string }[]> {
    const rows = await this.list(slug, 500);
    return rows.map((r) => ({ value: r.code, label: String(r.data['name'] ?? r.code) }));
  }

  // ── internals ───────────────────────────────────────────────────────────
  private async assemble(c: Ctx, row: Sql): Promise<DocumentRow> {
    const data: Record<string, unknown> = { [c.codeField]: row.code };
    for (const f of c.scalar) data[f.key] = row[f.key];
    if (row.extra && typeof row.extra === 'object') Object.assign(data, row.extra as Sql);
    for (const tf of c.tables) {
      const child = `${c.table}__${tf.key.toLowerCase()}`;
      const lines = (await AppDataSource.query(
        `SELECT * FROM ${ident(child)} WHERE "parent_id"=$1 ORDER BY "idx" ASC`,
        [row.id],
      )) as Sql[];
      const cols = (tf.columns ?? []).map((cc) => cc.key);
      data[tf.key] = lines.map((ln) => Object.fromEntries(cols.map((k) => [k, ln[k]])));
    }
    return { id: String(row.id), masterSlug: c.slug, code: String(row.code), data, status: String(row.status), state: (row.state as string) ?? null };
  }

  private split(c: Ctx, clean: Record<string, unknown>): { cols: string[]; vals: unknown[]; extra: Record<string, unknown> } {
    const colKeys = new Set(c.scalar.map((f) => f.key));
    const tableKeys = new Set(c.tables.map((f) => f.key));
    const cols: string[] = [];
    const vals: unknown[] = [];
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(clean)) {
      if (k === c.codeField || tableKeys.has(k)) continue;
      if (colKeys.has(k)) {
        cols.push(k);
        vals.push(v ?? null);
      } else {
        extra[k] = v;
      }
    }
    return { cols, vals, extra };
  }

  private async insertChildren(c: Ctx, parentId: string, clean: Record<string, unknown>): Promise<void> {
    for (const tf of c.tables) {
      const child = `${c.table}__${tf.key.toLowerCase()}`;
      const cols = (tf.columns ?? []).map((cc) => cc.key);
      const rows = Array.isArray(clean[tf.key]) ? (clean[tf.key] as Record<string, unknown>[]) : [];
      let idx = 0;
      for (const r of rows) {
        const names = ['"parent_id"', '"idx"', ...cols.map(ident)];
        const placeholders = ['$1', '$2', ...cols.map((_, i) => `$${i + 3}`)];
        const params = [parentId, idx++, ...cols.map((k) => r[k] ?? null)];
        await AppDataSource.query(`INSERT INTO ${ident(child)} (${names.join(', ')}) VALUES (${placeholders.join(', ')})`, params);
      }
    }
  }
}

export const documentDataService = new DocumentDataService();

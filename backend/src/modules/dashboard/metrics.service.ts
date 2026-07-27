import { AppDataSource } from '../../db/data-source.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { MasterRegistry } from '../master/master-registry.entity.js';
import { tableNameForSlug } from '../document/table-name.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import type { MetricSource } from './dashboard.schema.js';

/** Widget data shapes the frontend renders. */
export interface StatData { value: number; delta?: number }
export interface SeriesData { points: { label: string; value: number }[] }
export interface TableData { columns: string[]; rows: Record<string, unknown>[] }
export type WidgetData = StatData | SeriesData | TableData;

/** Columns the engine treats as real columns on BOTH master_data and doc tables. */
const COMMON_COLUMNS = new Set(['status', 'state', 'code', 'createdAt', 'updatedAt']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface Resolved {
  slug: string;
  kind: 'master' | 'document';
  table: string;
  columns: Set<string>;
}

/**
 * The metrics engine. Resolves a widget's `source` into data by querying the
 * generic stores — master_data (fields live in a `data` jsonb) for master kinds,
 * the dedicated doc_* table (fields are real columns, nested groups in `extra`) for
 * document kinds. Everything is parameterized; field/master names come from seeded
 * config but are still validated as identifiers so a bad config can't inject SQL.
 */
export class MetricsService {
  private readonly registry = new BaseRepository(MasterRegistry);
  private readonly columnCache = new Map<string, Set<string>>();

  /** Look up how a master/doctype is stored so field references resolve correctly. */
  private async resolve(slug: string): Promise<Resolved> {
    const reg = await this.registry.findOne({ slug });
    if (!reg) throw new NotFoundError(`unknown master for metric: ${slug}`);
    if (reg.kind === 'master') {
      return { slug, kind: 'master', table: 'master_data', columns: COMMON_COLUMNS };
    }
    const table = reg.tableName ?? tableNameForSlug(slug);
    return { slug, kind: 'document', table, columns: await this.columnsOf(table) };
  }

  private async columnsOf(table: string): Promise<Set<string>> {
    const hit = this.columnCache.get(table);
    if (hit) return hit;
    const rows = (await AppDataSource.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [table],
    )) as { column_name: string }[];
    const set = new Set(rows.map((r) => r.column_name));
    this.columnCache.set(table, set);
    return set;
  }

  /** SQL expression for a field: a real column, or a jsonb text extraction. */
  private fieldExpr(r: Resolved, field: string): string {
    if (!IDENT.test(field)) throw new BadRequestError(`invalid field in metric: ${field}`);
    if (r.kind === 'master') {
      return COMMON_COLUMNS.has(field) ? `"${field}"` : `data->>'${field}'`;
    }
    return r.columns.has(field) ? `"${field}"` : `extra->>'${field}'`;
  }

  /** Base WHERE (soft-delete + master scoping) with its leading params. */
  private base(r: Resolved): { where: string; params: unknown[] } {
    return r.kind === 'master'
      ? { where: `master_slug = $1 AND "deletedAt" IS NULL`, params: [r.slug] }
      : { where: `"deletedAt" IS NULL`, params: [] };
  }

  /** Append config `where` equality filters, returning the SQL and growing params. */
  private applyWhere(r: Resolved, where: Record<string, unknown> | undefined, params: unknown[]): string {
    if (!where) return '';
    const parts: string[] = [];
    for (const [field, value] of Object.entries(where)) {
      params.push(value);
      parts.push(`${this.fieldExpr(r, field)} = $${params.length}`);
    }
    return parts.length ? ` AND ${parts.join(' AND ')}` : '';
  }

  async resolveSource(source: MetricSource): Promise<WidgetData> {
    const r = await this.resolve(source.master);
    switch (source.kind) {
      case 'count':
        return this.count(r, source);
      case 'groupCount':
        return this.groupCount(r, source);
      case 'timeSeries':
        return this.timeSeries(r, source);
      case 'recent':
        return this.recent(r, source);
    }
  }

  private async count(r: Resolved, s: Extract<MetricSource, { kind: 'count' }>): Promise<StatData> {
    const { where, params } = this.base(r);
    const filter = this.applyWhere(r, s.where, params);
    const [row] = (await AppDataSource.query(
      `SELECT COUNT(*)::int AS n FROM ${r.table} WHERE ${where}${filter}`,
      params,
    )) as { n: number }[];
    const value = Number(row?.n ?? 0);

    // Momentum delta: new rows in the last 30 days vs the 30 before, as a %.
    let delta: number | undefined;
    if (s.dateField) {
      const dExpr = `(${this.fieldExpr(r, s.dateField)})::timestamptz`;
      const dp = [...params];
      const [d] = (await AppDataSource.query(
        `SELECT
           COUNT(*) FILTER (WHERE ${dExpr} >= now() - interval '30 days')::int AS cur,
           COUNT(*) FILTER (WHERE ${dExpr} >= now() - interval '60 days'
                              AND ${dExpr} < now() - interval '30 days')::int AS prev
         FROM ${r.table} WHERE ${where}${filter}`,
        dp,
      )) as { cur: number; prev: number }[];
      const cur = Number(d?.cur ?? 0);
      const prev = Number(d?.prev ?? 0);
      if (prev > 0) delta = Math.round(((cur - prev) / prev) * 1000) / 10;
      else if (cur > 0) delta = 100;
    }
    return delta === undefined ? { value } : { value, delta };
  }

  private async groupCount(r: Resolved, s: Extract<MetricSource, { kind: 'groupCount' }>): Promise<SeriesData> {
    const { where, params } = this.base(r);
    const expr = this.fieldExpr(r, s.groupBy);
    params.push(s.limit);
    const rows = (await AppDataSource.query(
      `SELECT ${expr} AS label, COUNT(*)::int AS value
         FROM ${r.table} WHERE ${where} AND ${expr} IS NOT NULL AND ${expr} <> ''
        GROUP BY 1 ORDER BY value DESC LIMIT $${params.length}`,
      params,
    )) as { label: string; value: number }[];
    return { points: rows.map((x) => ({ label: String(x.label), value: Number(x.value) })) };
  }

  private async timeSeries(r: Resolved, s: Extract<MetricSource, { kind: 'timeSeries' }>): Promise<SeriesData> {
    const { where, params } = this.base(r);
    const dExpr = `(${this.fieldExpr(r, s.dateField)})::timestamptz`;
    // bucket + periods come from a bounded enum / validated number — safe to inline.
    const unit = s.bucket; // day | week | month
    const rows = (await AppDataSource.query(
      `SELECT to_char(date_trunc('${unit}', ${dExpr}), 'YYYY-MM-DD') AS label, COUNT(*)::int AS value
         FROM ${r.table}
        WHERE ${where} AND ${dExpr} >= date_trunc('${unit}', now()) - make_interval(${unit}s => ${s.periods})
        GROUP BY 1 ORDER BY 1`,
      params,
    )) as { label: string; value: number }[];
    return { points: rows.map((x) => ({ label: String(x.label), value: Number(x.value) })) };
  }

  private async recent(r: Resolved, s: Extract<MetricSource, { kind: 'recent' }>): Promise<TableData> {
    const { where, params } = this.base(r);
    // Each requested column, aliased to its own name; always include code/status/state
    // so the table widget can show the id and the status/state badges.
    const selects = s.columns.map((c) => `${this.fieldExpr(r, c)} AS "${c}"`);
    selects.push(`"code" AS "__code"`, `"status" AS "__rowStatus"`, `"state" AS "__rowState"`);
    params.push(s.limit);
    const rows = (await AppDataSource.query(
      `SELECT ${selects.join(', ')} FROM ${r.table} WHERE ${where}
        ORDER BY "createdAt" DESC LIMIT $${params.length}`,
      params,
    )) as Record<string, unknown>[];
    return { columns: s.columns, rows };
  }
}

export const metricsService = new MetricsService();

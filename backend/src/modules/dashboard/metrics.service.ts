import { AppDataSource } from '../../db/data-source.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { MasterRegistry } from '../master/master-registry.entity.js';
import { tableNameForSlug } from '../document/table-name.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import type { MetricSource } from './dashboard.schema.js';

/** Widget data shapes the frontend renders. */
export interface StatData { value: number; delta?: number; spark?: number[] }
export interface SeriesData { points: { label: string; value: number }[] }
export interface TableData { columns: string[]; rows: Record<string, unknown>[] }
export type WidgetData = StatData | SeriesData | TableData;

/** Columns the engine treats as real columns on BOTH master_data and doc tables. */
const COMMON_COLUMNS = new Set(['status', 'state', 'code', 'createdAt', 'updatedAt']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

  /**
   * The dashboard date-range filter, applied as an open-ended "since" bound so
   * future-dated documents stay visible. A no-op when there's no active range or
   * the source has no date field to filter on.
   */
  private sinceFilter(r: Resolved, dateField: string | undefined, from: string | undefined, params: unknown[]): string {
    if (!from || !dateField) return '';
    if (!ISO_DATE.test(from)) throw new BadRequestError(`invalid date range: ${from}`);
    params.push(from);
    return ` AND (${this.fieldExpr(r, dateField)})::timestamptz >= $${params.length}::timestamptz`;
  }

  async resolveSource(source: MetricSource, from?: string): Promise<WidgetData> {
    const r = await this.resolve(source.master);
    switch (source.kind) {
      case 'count':
        return this.count(r, source, from);
      case 'groupCount':
        return this.groupCount(r, source, from);
      case 'timeSeries':
        return this.timeSeries(r, source, from);
      case 'recent':
        return this.recent(r, source);
    }
  }

  private async count(r: Resolved, s: Extract<MetricSource, { kind: 'count' }>, from?: string): Promise<StatData> {
    const { where, params } = this.base(r);
    // The common (config `where`) filter applies to every query below; the date range
    // only narrows the headline value — the delta/spark keep their own trailing windows
    // (a 30-day range would otherwise zero out the prior-period comparison).
    const common = this.applyWhere(r, s.where, params);
    const valueParams = [...params];
    const filter = common + this.sinceFilter(r, s.dateField, from, valueParams);
    const [row] = (await AppDataSource.query(
      `SELECT COUNT(*)::int AS n FROM ${r.table} WHERE ${where}${filter}`,
      valueParams,
    )) as { n: number }[];
    const value = Number(row?.n ?? 0);

    if (!s.dateField) return { value };

    // With a date field, add the momentum delta (last 30 days vs the 30 before) and a
    // 14-day daily spark series, so the card shows a trend, not just a number.
    const dExpr = `(${this.fieldExpr(r, s.dateField)})::timestamptz`;
    const [d] = (await AppDataSource.query(
      `SELECT
         COUNT(*) FILTER (WHERE ${dExpr} >= now() - interval '30 days')::int AS cur,
         COUNT(*) FILTER (WHERE ${dExpr} >= now() - interval '60 days'
                            AND ${dExpr} < now() - interval '30 days')::int AS prev
       FROM ${r.table} WHERE ${where}${common}`,
      [...params],
    )) as { cur: number; prev: number }[];
    const cur = Number(d?.cur ?? 0);
    const prev = Number(d?.prev ?? 0);
    let delta: number | undefined;
    if (prev > 0) delta = Math.round(((cur - prev) / prev) * 1000) / 10;
    else if (cur > 0) delta = 100;

    // Zero-filled 14-day daily series. A CTE keeps the row-count query on its own
    // table (natural column names, no join alias) and left-joins it onto the calendar.
    const sparkRows = (await AppDataSource.query(
      `WITH days AS (
         SELECT generate_series(date_trunc('day', now()) - interval '13 days',
                                date_trunc('day', now()), interval '1 day') AS d
       ),
       hits AS (
         SELECT date_trunc('day', ${dExpr}) AS d, COUNT(*)::int AS n
           FROM ${r.table}
          WHERE ${where}${common} AND ${dExpr} >= date_trunc('day', now()) - interval '13 days'
          GROUP BY 1
       )
       SELECT COALESCE(hits.n, 0)::int AS n
         FROM days LEFT JOIN hits ON hits.d = days.d
        ORDER BY days.d`,
      [...params],
    )) as { n: number }[];
    const spark = sparkRows.map((x) => Number(x.n));

    return { value, ...(delta === undefined ? {} : { delta }), spark };
  }

  private async groupCount(r: Resolved, s: Extract<MetricSource, { kind: 'groupCount' }>, from?: string): Promise<SeriesData> {
    const { where, params } = this.base(r);
    const expr = this.fieldExpr(r, s.groupBy);
    const since = this.sinceFilter(r, s.dateField, from, params);
    params.push(s.limit);
    const rows = (await AppDataSource.query(
      `SELECT ${expr} AS label, COUNT(*)::int AS value
         FROM ${r.table} WHERE ${where} AND ${expr} IS NOT NULL AND ${expr} <> ''${since}
        GROUP BY 1 ORDER BY value DESC LIMIT $${params.length}`,
      params,
    )) as { label: string; value: number }[];
    return { points: rows.map((x) => ({ label: String(x.label), value: Number(x.value) })) };
  }

  private async timeSeries(r: Resolved, s: Extract<MetricSource, { kind: 'timeSeries' }>, from?: string): Promise<SeriesData> {
    const { where, params } = this.base(r);
    const dExpr = `(${this.fieldExpr(r, s.dateField)})::timestamptz`;
    // bucket + periods come from a bounded enum / validated number — safe to inline.
    const unit = s.bucket; // day | week | month
    // An active range overrides the default lookback so the trend matches the picker.
    let lower = `date_trunc('${unit}', now()) - make_interval(${unit}s => ${s.periods})`;
    if (from) {
      if (!ISO_DATE.test(from)) throw new BadRequestError(`invalid date range: ${from}`);
      params.push(from);
      lower = `date_trunc('${unit}', $${params.length}::timestamptz)`;
    }
    const rows = (await AppDataSource.query(
      `SELECT to_char(date_trunc('${unit}', ${dExpr}), 'YYYY-MM-DD') AS label, COUNT(*)::int AS value
         FROM ${r.table}
        WHERE ${where} AND ${dExpr} >= ${lower}
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

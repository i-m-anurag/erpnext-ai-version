import { z } from 'zod';
import { registerResourceType } from '../config/index.js';

/**
 * A module dashboard is an ordered list of widgets. Each widget says WHAT to show
 * (a stat, a chart, or a table) and WHERE its data comes from (a metric `source`).
 * The whole thing is seeded config — a new module gets a dashboard by dropping a
 * JSON file, no component code — so the generic dashboard renderer stays module-blind.
 */

/** A metric query. The kind decides the shape of the data the engine returns. */
export const metricSourceSchema = z.discriminatedUnion('kind', [
  // A single number (optionally with a % change vs the previous period).
  z.object({
    kind: z.literal('count'),
    master: z.string().min(1),
    where: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    /** Field to base the prev-period delta on; omit to skip the delta. */
    dateField: z.string().optional(),
  }),
  // Category breakdown → [{ label, value }], e.g. receipts grouped by supplier.
  z.object({
    kind: z.literal('groupCount'),
    master: z.string().min(1),
    groupBy: z.string().min(1),
    /** Field the dashboard date range filters on; omit to always count all-time. */
    dateField: z.string().optional(),
    limit: z.number().int().positive().max(50).default(8),
  }),
  // A time bucketed series → [{ label, value }] over a date field.
  z.object({
    kind: z.literal('timeSeries'),
    master: z.string().min(1),
    dateField: z.string().min(1),
    bucket: z.enum(['day', 'week', 'month']).default('day'),
    /** How far back to look, in buckets. */
    periods: z.number().int().positive().max(365).default(30),
  }),
  // The latest N rows, chosen columns → a small table.
  z.object({
    kind: z.literal('recent'),
    master: z.string().min(1),
    columns: z.array(z.string().min(1)).min(1),
    limit: z.number().int().positive().max(50).default(8),
  }),
]);

export type MetricSource = z.infer<typeof metricSourceSchema>;

export const dashboardWidgetSchema = z.object({
  type: z.enum(['stat', 'chart', 'table']),
  title: z.string().min(1),
  /** Columns spanned on the 4-column grid. */
  span: z.number().int().min(1).max(4).default(1),
  /** Chart flavour — required (and only used) when type = 'chart'. */
  chart: z.enum(['bar', 'line', 'pie']).optional(),
  /** Phosphor icon class for a stat card, e.g. "ph-cube". */
  icon: z.string().optional(),
  /** Accent colour for a stat card's icon + sparkline. */
  tone: z.enum(['accent', 'success', 'warning', 'danger', 'info']).default('accent'),
  source: metricSourceSchema,
});

export type DashboardWidget = z.infer<typeof dashboardWidgetSchema>;

export const dashboardSchema = z.object({
  slug: z.string().min(1),
  widgets: z.array(dashboardWidgetSchema).default([]),
});

export type Dashboard = z.infer<typeof dashboardSchema>;

export const MODULE_DASHBOARD_RESOURCE_TYPE = 'module_dashboard';

export function registerDashboardResourceType(): void {
  registerResourceType(MODULE_DASHBOARD_RESOURCE_TYPE, {
    schema: dashboardSchema,
    arrayMergeKeys: {},
    ttlSeconds: 3600,
  });
}

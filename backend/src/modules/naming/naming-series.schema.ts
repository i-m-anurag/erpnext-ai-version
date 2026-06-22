import { z } from 'zod';
import { registerResourceType } from '../config/index.js';

/**
 * Naming-series config for an entity (keyed by the entity slug). Pattern tokens:
 *   {YYYY} 4-digit year · {YY} 2-digit · {MM} 2-digit month · {FY} fiscal year ·
 *   {###…} zero-padded counter (padding = number of #).
 * `reset` controls when the counter restarts.
 */
export const namingSeriesSchema = z.object({
  slug: z.string().min(1),
  pattern: z.string().min(1),
  reset: z.enum(['never', 'yearly', 'monthly']).default('yearly'),
});

export type NamingSeries = z.infer<typeof namingSeriesSchema>;

export const NAMING_SERIES_RESOURCE_TYPE = 'naming_series';

export function registerNamingSeriesResourceType(): void {
  registerResourceType(NAMING_SERIES_RESOURCE_TYPE, {
    schema: namingSeriesSchema,
    arrayMergeKeys: {},
    ttlSeconds: 3600,
  });
}

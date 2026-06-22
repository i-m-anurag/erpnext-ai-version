import { AppDataSource } from '../../db/data-source.js';
import { configResolver } from '../config/index.js';
import { NAMING_SERIES_RESOURCE_TYPE, type NamingSeries } from './naming-series.schema.js';

/**
 * Generates the next code for an entity from its naming series. Returns null if
 * the entity has no series configured (→ caller keeps the user-provided code).
 * Counters are bumped atomically in the `sequences` table.
 */
export class NamingSeriesService {
  async next(entitySlug: string): Promise<string | null> {
    const cfg = await this.config(entitySlug);
    if (!cfg) return null;
    const period = periodKey(cfg.reset);
    const counter = await this.bump(entitySlug, period);
    return format(cfg.pattern, counter);
  }

  /** Resolve the series config, or null if none exists. */
  private async config(entitySlug: string): Promise<NamingSeries | null> {
    try {
      const eff = await configResolver.resolve<NamingSeries>(NAMING_SERIES_RESOURCE_TYPE, entitySlug);
      return eff.definition;
    } catch {
      return null;
    }
  }

  /** Atomic increment: returns the new counter for (series, period). */
  private async bump(seriesKey: string, period: string): Promise<number> {
    const rows = (await AppDataSource.query(
      `INSERT INTO "sequences" ("series_key", "period_key", "counter") VALUES ($1, $2, 1)
       ON CONFLICT ("series_key", "period_key") DO UPDATE SET "counter" = "sequences"."counter" + 1
       RETURNING "counter"`,
      [seriesKey, period],
    )) as Array<{ counter: number }>;
    return Number(rows[0]?.counter ?? 1);
  }
}

export const namingSeriesService = new NamingSeriesService();

/** Period bucket for the reset policy. */
function periodKey(reset: NamingSeries['reset']): string {
  const now = new Date();
  if (reset === 'never') return 'all';
  const y = now.getUTCFullYear();
  if (reset === 'monthly') return `${y}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return String(y); // yearly
}

/** Fill the pattern tokens with the date + counter. */
function format(pattern: string, counter: number): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  return pattern.replace(/\{(#+|YYYY|YY|MM|FY)\}/g, (_m, token: string) => {
    if (token.startsWith('#')) return String(counter).padStart(token.length, '0');
    switch (token) {
      case 'YYYY':
        return String(y);
      case 'YY':
        return String(y % 100).padStart(2, '0');
      case 'MM':
        return String(now.getUTCMonth() + 1).padStart(2, '0');
      case 'FY':
        return String(y); // fiscal year — calendar year for now
      default:
        return token;
    }
  });
}

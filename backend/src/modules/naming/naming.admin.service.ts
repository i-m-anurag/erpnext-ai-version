import { BaseRepository } from '../../shared/base.repository.js';
import { NotFoundError } from '../../shared/errors.js';
import { ConfigResource } from '../config/config-resource.entity.js';
import { configResolver } from '../config/index.js';
import { NAMING_SERIES_RESOURCE_TYPE, namingSeriesSchema, type NamingSeries } from './naming-series.schema.js';

export interface NamingSummary extends NamingSeries {
  resolvedFrom: string;
}

/** UI CRUD over naming-series configs (base/custom; writes go to custom). */
export class NamingAdminService {
  private readonly repo = new BaseRepository(ConfigResource);

  async list(): Promise<NamingSummary[]> {
    const rows = await this.repo.find({ where: { resourceType: NAMING_SERIES_RESOURCE_TYPE, status: 'active' } });
    const slugs = [...new Set(rows.map((r) => r.slug))].sort();
    const out: NamingSummary[] = [];
    for (const slug of slugs) {
      const eff = await configResolver.resolve<NamingSeries>(NAMING_SERIES_RESOURCE_TYPE, slug);
      out.push({ ...eff.definition, resolvedFrom: eff.resolvedFrom });
    }
    return out;
  }

  async get(slug: string): Promise<NamingSummary> {
    const eff = await configResolver.resolve<NamingSeries>(NAMING_SERIES_RESOURCE_TYPE, slug);
    return { ...eff.definition, resolvedFrom: eff.resolvedFrom };
  }

  async save(slug: string, input: unknown): Promise<NamingSeries> {
    const def = namingSeriesSchema.parse({ ...(input as Record<string, unknown>), slug });
    await configResolver.upsert(NAMING_SERIES_RESOURCE_TYPE, slug, 'custom', def as unknown as Record<string, unknown>);
    return def;
  }

  async resetOverride(slug: string): Promise<void> {
    const custom = await this.repo.findOne({ resourceType: NAMING_SERIES_RESOURCE_TYPE, slug, scope: 'custom' });
    if (!custom) throw new NotFoundError('no custom override to reset');
    await this.repo.delete(custom.id);
    await configResolver.invalidate(NAMING_SERIES_RESOURCE_TYPE, slug);
  }
}

export const namingAdminService = new NamingAdminService();

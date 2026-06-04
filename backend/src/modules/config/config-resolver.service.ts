import type { EntityManager } from 'typeorm';
import { BaseRepository } from '../../shared/base.repository.js';
import { cache } from '../../shared/cache/cache.service.js';
import { deepMerge } from '../../shared/merge/deep-merge.js';
import { NotFoundError } from '../../shared/errors.js';
import { ConfigResource } from './config-resource.entity.js';
import { DEFAULT_RESOURCE_TTL_SECONDS, getResourceType } from './resource-type.registry.js';
import type { ConfigScope, EffectiveResource } from './config.types.js';

/** Namespaced, per-resource cache key. Invalidated on write (§5.9). */
function cacheKey(resourceType: string, slug: string): string {
  return `cfg:${resourceType}:${slug}`;
}

/** Order-independent JSON serialization for semantic equality (JSONB reorders keys). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * The single generic resolver that serves every configurable resource (forms,
 * email templates, master schemas, workflows). Implements the §3.4 pipeline:
 * cache → base+override fetch → deepMerge → Zod validate → cache → return.
 */
export class ConfigResolverService {
  private readonly repo = new BaseRepository(ConfigResource);

  /** Resolve the effective definition for a resource, cached in Redis. */
  async resolve<T = unknown>(resourceType: string, slug: string): Promise<EffectiveResource<T>> {
    const { ttlSeconds } = getResourceType(resourceType);
    return cache.getOrBuild<EffectiveResource<T>>(
      cacheKey(resourceType, slug),
      () => this.build<T>(resourceType, slug),
      { ttlSeconds: ttlSeconds ?? DEFAULT_RESOURCE_TTL_SECONDS },
    );
  }

  /** Build the effective resource from the DB (the cache miss path). */
  private async build<T>(resourceType: string, slug: string): Promise<EffectiveResource<T>> {
    const rt = getResourceType(resourceType);

    const [base, override] = await Promise.all([
      this.repo.findOne({ resourceType, slug, scope: 'base', status: 'active' }),
      this.repo.findOne({ resourceType, slug, scope: 'custom', status: 'active' }),
    ]);

    if (!base && !override) {
      throw new NotFoundError(`config resource not found: ${resourceType}/${slug}`);
    }

    const baseDef = base?.definition ?? {};
    const merged = override
      ? deepMerge(baseDef, override.definition, rt.arrayMergeKeys)
      : baseDef;

    // The API never trusts a resolved definition until it passes the type's Zod
    // schema — one source of truth for what a valid resource looks like.
    const definition = rt.schema.parse(merged) as T;

    return {
      resourceType,
      slug,
      version: Math.max(base?.version ?? 0, override?.version ?? 0),
      resolvedFrom: override ? 'merged' : 'base',
      definition,
    };
  }

  /** Drop the cached entry so the next resolve rebuilds (call after any write). */
  async invalidate(resourceType: string, slug: string): Promise<void> {
    await cache.invalidate(cacheKey(resourceType, slug));
  }

  /**
   * Idempotent seed of one scope layer: insert if absent, update (and bump
   * version) only when the content actually changed, otherwise no-op. Lets the
   * file seeders run on every deploy without inflating versions (§7) — for both
   * shipped base definitions and client overrides.
   */
  async seedResource(
    resourceType: string,
    slug: string,
    scope: ConfigScope,
    definition: Record<string, unknown>,
  ): Promise<{ changed: boolean }> {
    const existing = await this.repo.findOne({ resourceType, slug, scope });
    if (existing && stableStringify(existing.definition) === stableStringify(definition)) {
      return { changed: false };
    }
    await this.upsert(resourceType, slug, scope, definition);
    return { changed: true };
  }

  /**
   * Insert or update one scope layer of a resource, bumping its version and
   * invalidating the cache. Used by module write paths and seeders.
   */
  async upsert(
    resourceType: string,
    slug: string,
    scope: ConfigScope,
    definition: Record<string, unknown>,
    manager?: EntityManager,
  ): Promise<ConfigResource> {
    const repo = manager ? this.repo.withManager(manager) : this.repo;
    const existing = await repo.findOne({ resourceType, slug, scope });

    const row = repo.create({
      ...(existing ?? {}),
      resourceType,
      slug,
      scope,
      definition,
      status: 'active',
      version: existing ? existing.version + 1 : 1,
    });
    const saved = await repo.save(row);

    await this.invalidate(resourceType, slug);
    return saved;
  }
}

export const configResolver = new ConfigResolverService();

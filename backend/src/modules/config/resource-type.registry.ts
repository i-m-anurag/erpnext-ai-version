import type { ZodType } from 'zod';
import type { ArrayMergeKeys } from '../../shared/merge/deep-merge.js';

/**
 * Describes how one configurable resource type (form, email_template,
 * master_schema, workflow, …) is validated and merged. Each configurable module
 * registers its type at startup; the generic resolver stays type-agnostic.
 */
export interface ResourceTypeConfig<T = unknown> {
  /** Zod schema validating the EFFECTIVE (merged) definition. */
  schema: ZodType<T>;
  /** Array properties that merge element-wise by an id field (e.g. fields→key). */
  arrayMergeKeys?: ArrayMergeKeys;
  /** Cache TTL in seconds (defaults to a long TTL — these rarely change). */
  ttlSeconds?: number;
}

/** Default TTL for resolved config: 1 hour. Invalidation is write-driven, so this is a safety net. */
export const DEFAULT_RESOURCE_TTL_SECONDS = 3600;

const registry = new Map<string, ResourceTypeConfig>();

export function registerResourceType<T>(type: string, config: ResourceTypeConfig<T>): void {
  if (registry.has(type)) {
    throw new Error(`resource type already registered: ${type}`);
  }
  registry.set(type, config as ResourceTypeConfig);
}

export function getResourceType(type: string): ResourceTypeConfig {
  const cfg = registry.get(type);
  if (!cfg) {
    throw new Error(`unknown configurable resource type: ${type}`);
  }
  return cfg;
}

export function isResourceTypeRegistered(type: string): boolean {
  return registry.has(type);
}

/** Test-only: clear the registry between isolated test runs. */
export function __resetRegistry(): void {
  registry.clear();
}

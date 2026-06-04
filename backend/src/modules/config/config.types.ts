/** Layering scope of a configurable resource (§3.3). */
export type ConfigScope = 'base' | 'custom';

/** Result of resolving a configurable resource = deepMerge(base, override). */
export interface EffectiveResource<T = unknown> {
  resourceType: string;
  slug: string;
  /** effective version (max of contributing rows) — used for document pinning */
  version: number;
  /** whether the result is base-only or base+override merged */
  resolvedFrom: 'base' | 'merged';
  definition: T;
}

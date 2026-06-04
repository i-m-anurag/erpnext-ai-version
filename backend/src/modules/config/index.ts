/**
 * Config module public API — the generic config-resolution pipeline (§3.4).
 * Configurable modules (form, communication, master, workflow) register their
 * resource type here and resolve effective definitions through `configResolver`.
 */
export { configResolver, ConfigResolverService } from './config-resolver.service.js';
export { registerResourceType, getResourceType, isResourceTypeRegistered } from './resource-type.registry.js';
export type { ResourceTypeConfig } from './resource-type.registry.js';
export { ConfigResource } from './config-resource.entity.js';
export type { ConfigScope, EffectiveResource } from './config.types.js';

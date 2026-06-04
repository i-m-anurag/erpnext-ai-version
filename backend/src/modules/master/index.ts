/**
 * Master module (§5.5): the master registry + a generic master-data store with
 * CRUD validated against each master's form definition, and cached dropdown
 * options. Seeded masters are read-only; UI-managed masters allow CRUD.
 */
export { MasterRegistry } from './master-registry.entity.js';
export { MasterData } from './master-data.entity.js';
export { masterService, type MasterRegistryDef, type MasterOption } from './master.service.js';
export { buildMasterRouter } from './master.routes.js';

/**
 * Shape of a permission definition. The actual catalog of shipped permissions
 * now lives in seed-data/base/permissions/<module>.json (one file per module) and
 * is loaded by the permissions seeder — so capabilities are data, not code.
 */
export interface PermissionDef {
  module: string;
  action: string;
  description: string;
}

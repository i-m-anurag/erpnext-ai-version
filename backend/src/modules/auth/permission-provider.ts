/**
 * Seam between auth and the permission module. Auth needs the effective
 * permission snapshot when it creates a session, but must not hard-depend on the
 * permission module (which may be disabled for a deployment). The permission
 * module registers its resolver at startup; until then the default grants none.
 */
export type PermissionResolver = (userId: string) => Promise<string[]>;

let resolver: PermissionResolver = async () => [];

export function setPermissionResolver(fn: PermissionResolver): void {
  resolver = fn;
}

export function resolvePermissions(userId: string): Promise<string[]> {
  return resolver(userId);
}

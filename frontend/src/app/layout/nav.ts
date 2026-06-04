/** Sidebar navigation. Items are shown only when their module is enabled AND the
 *  user holds the permission (filtered in the shell). The backend stays the real gate. */
export interface NavItem {
  label: string;
  route: string;
  /** Layer-1 module-enablement gate (optional). */
  module?: string;
  /** Permission required to see this item (optional). */
  permission?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', route: '/app/dashboard' },
  { label: 'Masters', route: '/app/masters', module: 'master', permission: 'master:view' },
  { label: 'Roles & Permissions', route: '/app/roles', module: 'permission', permission: 'permission:role.read' },
];

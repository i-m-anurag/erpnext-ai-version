/** Sidebar navigation. Items are shown only when their module is enabled AND the
 *  user holds the permission (filtered in the shell). The backend stays the real gate. */
export interface NavItem {
  label: string;
  route: string;
  /** Phosphor icon class, e.g. 'ph-gauge' (rendered as `<i class="ph ph-gauge">`). */
  icon: string;
  /** Layer-1 module-enablement gate (optional). */
  module?: string;
  /** Permission required to see this item (optional). */
  permission?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', route: '/app/dashboard', icon: 'ph-gauge' },
  { label: 'Masters', route: '/app/masters', icon: 'ph-database', module: 'master', permission: 'master:view' },
  { label: 'Roles & Permissions', route: '/app/roles', icon: 'ph-shield-check', module: 'permission', permission: 'permission:role.read' },
  { label: 'Form Playground', route: '/app/playground', icon: 'ph-flask' },
];

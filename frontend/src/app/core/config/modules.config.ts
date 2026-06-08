/**
 * Module registry for the Workspace Home launcher + module navigation.
 * UI-first/mock for now (KPIs are placeholder strings); later this is driven by
 * the backend (enabled modules from /api/meta + live KPIs). `subModules` feed the
 * module workspace sidebar.
 */
export interface SubModule {
  slug: string;
  name: string;
  icon: string; // phosphor class, e.g. 'ph-cube'
}

export interface ErpModule {
  slug: string;
  name: string;
  description: string;
  icon: string; // phosphor class
  kpi: string; // mock summary stat
  subModules: SubModule[];
}

export const MODULES: ErpModule[] = [
  {
    slug: 'hr',
    name: 'HR',
    description: 'Employee records, payroll, performance reviews and recruitment.',
    icon: 'ph-users-three',
    kpi: '320 employees · 4 on leave',
    subModules: [
      { slug: 'dashboard', name: 'Dashboard', icon: 'ph-gauge' },
      { slug: 'employees', name: 'Employees', icon: 'ph-identification-badge' },
      { slug: 'attendance', name: 'Attendance', icon: 'ph-calendar-check' },
      { slug: 'payroll', name: 'Payroll', icon: 'ph-money' },
      { slug: 'recruitment', name: 'Recruitment', icon: 'ph-user-plus' },
    ],
  },
  {
    slug: 'crm',
    name: 'CRM',
    description: 'Customer interactions, sales pipeline and account management.',
    icon: 'ph-handshake',
    kpi: '86 open deals · ₹2.4Cr',
    subModules: [
      { slug: 'dashboard', name: 'Dashboard', icon: 'ph-gauge' },
      { slug: 'leads', name: 'Leads', icon: 'ph-funnel' },
      { slug: 'deals', name: 'Deals', icon: 'ph-currency-circle-dollar' },
      { slug: 'accounts', name: 'Accounts', icon: 'ph-buildings' },
      { slug: 'activities', name: 'Activities', icon: 'ph-phone-call' },
    ],
  },
  {
    slug: 'inventory',
    name: 'Inventory',
    description: 'Real-time stock levels, warehouses, transfers and fulfilment.',
    icon: 'ph-package',
    kpi: '1,240 items · 12 low stock',
    subModules: [
      { slug: 'dashboard', name: 'Dashboard', icon: 'ph-gauge' },
      { slug: 'items', name: 'Items', icon: 'ph-cube' },
      { slug: 'stock', name: 'Stock Levels', icon: 'ph-stack' },
      { slug: 'movements', name: 'Stock Movements', icon: 'ph-arrows-left-right' },
      { slug: 'transfers', name: 'Transfers', icon: 'ph-truck' },
      { slug: 'warehouses', name: 'Warehouses', icon: 'ph-warehouse' },
    ],
  },
  {
    slug: 'finance',
    name: 'Finance & Accounting',
    description: 'General ledger, accounts payable/receivable and financial reports.',
    icon: 'ph-bank',
    kpi: 'Month-end close in 4 days',
    subModules: [
      { slug: 'dashboard', name: 'Dashboard', icon: 'ph-gauge' },
      { slug: 'ledger', name: 'General Ledger', icon: 'ph-book-open' },
      { slug: 'payables', name: 'Payables', icon: 'ph-arrow-up-right' },
      { slug: 'receivables', name: 'Receivables', icon: 'ph-arrow-down-left' },
      { slug: 'reports', name: 'Reports', icon: 'ph-chart-pie' },
    ],
  },
  {
    slug: 'procurement',
    name: 'Procurement',
    description: 'Vendor relationships, purchase orders and supply-chain logistics.',
    icon: 'ph-shopping-cart',
    kpi: '8 open POs',
    subModules: [
      { slug: 'dashboard', name: 'Dashboard', icon: 'ph-gauge' },
      { slug: 'vendors', name: 'Vendors', icon: 'ph-storefront' },
      { slug: 'requisitions', name: 'Requisitions', icon: 'ph-note-pencil' },
      { slug: 'purchase-orders', name: 'Purchase Orders', icon: 'ph-receipt' },
      { slug: 'invoices', name: 'Invoices', icon: 'ph-file-text' },
    ],
  },
  {
    slug: 'sales',
    name: 'Sales',
    description: 'Order management, pricing strategies and sales forecasting.',
    icon: 'ph-chart-line-up',
    kpi: 'Q3 target: 68%',
    subModules: [
      { slug: 'dashboard', name: 'Dashboard', icon: 'ph-gauge' },
      { slug: 'orders', name: 'Sales Orders', icon: 'ph-receipt' },
      { slug: 'quotations', name: 'Quotations', icon: 'ph-file-dashed' },
      { slug: 'customers', name: 'Customers', icon: 'ph-users' },
    ],
  },
  {
    slug: 'projects',
    name: 'Projects',
    description: 'Plan, track and deliver projects with tasks and timesheets.',
    icon: 'ph-kanban',
    kpi: '14 active · 2 at risk',
    subModules: [
      { slug: 'dashboard', name: 'Dashboard', icon: 'ph-gauge' },
      { slug: 'projects', name: 'Projects', icon: 'ph-folders' },
      { slug: 'tasks', name: 'Tasks', icon: 'ph-check-square' },
      { slug: 'timesheets', name: 'Timesheets', icon: 'ph-clock' },
    ],
  },
  {
    slug: 'manufacturing',
    name: 'Manufacturing',
    description: 'Bills of materials, work orders and production planning.',
    icon: 'ph-factory',
    kpi: '6 work orders running',
    subModules: [
      { slug: 'dashboard', name: 'Dashboard', icon: 'ph-gauge' },
      { slug: 'bom', name: 'Bills of Materials', icon: 'ph-tree-structure' },
      { slug: 'work-orders', name: 'Work Orders', icon: 'ph-gear-six' },
    ],
  },
  {
    slug: 'assets',
    name: 'Assets',
    description: 'Track fixed assets, maintenance schedules and depreciation.',
    icon: 'ph-cube-transparent',
    kpi: '540 assets tracked',
    subModules: [
      { slug: 'dashboard', name: 'Dashboard', icon: 'ph-gauge' },
      { slug: 'assets', name: 'Assets', icon: 'ph-cube' },
      { slug: 'maintenance', name: 'Maintenance', icon: 'ph-wrench' },
    ],
  },
  {
    slug: 'reports',
    name: 'Reports & Analytics',
    description: 'Cross-module dashboards, KPIs and AI-driven insights.',
    icon: 'ph-chart-bar',
    kpi: '24 dashboards',
    subModules: [
      { slug: 'dashboard', name: 'Dashboard', icon: 'ph-gauge' },
      { slug: 'builder', name: 'Report Builder', icon: 'ph-sliders' },
    ],
  },
  {
    slug: 'admin',
    name: 'Administration',
    description: 'Users, roles, masters, forms and system configuration.',
    icon: 'ph-gear',
    kpi: '19 permissions · 2 roles',
    subModules: [
      { slug: 'dashboard', name: 'Overview', icon: 'ph-gauge' },
      { slug: 'masters', name: 'Masters', icon: 'ph-database' },
      { slug: 'roles', name: 'Roles & Permissions', icon: 'ph-shield-check' },
      { slug: 'playground', name: 'Form Playground', icon: 'ph-flask' },
    ],
  },
];

export function findModule(slug: string): ErpModule | undefined {
  return MODULES.find((m) => m.slug === slug);
}

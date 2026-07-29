import { Routes } from '@angular/router';
import { authGuard, permissionGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/workspace-home/workspace-home.component').then((m) => m.WorkspaceHomeComponent),
      },
      {
        // Administration module — wires the pre-existing (API-backed) masters,
        // roles and dynamic-form playground into the new module shell. Declared
        // BEFORE the generic `m/:slug` route so these specific subs win.
        path: 'm/admin',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
          {
            path: 'masters',
            canActivate: [permissionGuard],
            data: { permission: 'master:view', title: 'Masters' },
            loadComponent: () =>
              import('./features/masters/masters-list.component').then((m) => m.MastersListComponent),
          },
          {
            path: 'masters/:slug',
            canActivate: [permissionGuard],
            data: { permission: 'master:view', title: 'Master' },
            loadComponent: () =>
              import('./features/masters/master-detail.component').then((m) => m.MasterDetailComponent),
          },
          {
            path: 'roles',
            canActivate: [permissionGuard],
            data: { permission: 'permission:role.read', title: 'Roles & Permissions' },
            loadComponent: () =>
              import('./features/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
          },
          {
            path: 'playground',
            loadComponent: () =>
              import('./features/playground/playground.component').then((m) => m.PlaygroundComponent),
          },
          {
            path: 'communication',
            canActivate: [permissionGuard],
            data: { permission: 'communication:template.read', title: 'Email Templates' },
            loadComponent: () =>
              import('./features/communication/templates-list.component').then((m) => m.TemplatesListComponent),
          },
          {
            path: 'communication/:slug',
            canActivate: [permissionGuard],
            data: { permission: 'communication:template.read', title: 'Email Template' },
            loadComponent: () =>
              import('./features/communication/template-editor.component').then((m) => m.TemplateEditorComponent),
          },
          {
            path: 'workflows',
            canActivate: [permissionGuard],
            data: { permission: 'workflow:view', title: 'Workflows' },
            loadComponent: () =>
              import('./features/workflow/workflows-list.component').then((m) => m.WorkflowsListComponent),
          },
          {
            path: 'workflows/:slug',
            canActivate: [permissionGuard],
            data: { permission: 'workflow:view', title: 'Workflow' },
            loadComponent: () =>
              import('./features/workflow/workflow-editor.component').then((m) => m.WorkflowEditorComponent),
          },
          {
            path: 'numbering',
            canActivate: [permissionGuard],
            data: { permission: 'config:config.read', title: 'Numbering' },
            loadComponent: () =>
              import('./features/naming/numbering-list.component').then((m) => m.NumberingListComponent),
          },
          {
            path: 'numbering/:slug',
            canActivate: [permissionGuard],
            data: { permission: 'config:config.read', title: 'Numbering' },
            loadComponent: () =>
              import('./features/naming/numbering-editor.component').then((m) => m.NumberingEditorComponent),
          },
          {
            // dashboard / any other admin sub → generic module workspace
            path: ':sub',
            data: { slug: 'admin' },
            loadComponent: () =>
              import('./features/module-workspace/module-workspace.component').then(
                (m) => m.ModuleWorkspaceComponent,
              ),
          },
        ],
      },
      {
        // Inventory module — stock reports. Declared before the generic m/:slug route
        // so these specific subs win; the doctype lists fall through to the generic
        // workspace via the `:sub` route below.
        path: 'm/inventory',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
          {
            path: 'stock',
            loadComponent: () =>
              import('./features/inventory/stock-levels.component').then((m) => m.StockLevelsComponent),
          },
          {
            path: 'movements',
            loadComponent: () =>
              import('./features/inventory/stock-ledger.component').then((m) => m.StockLedgerComponent),
          },
          {
            // Warehouses ARE the warehouse master — reuse the master browser rather than
            // maintain a separate mock, so Inventory and Admin edit the same records.
            path: 'warehouses',
            data: { slug: 'warehouse' },
            loadComponent: () => import('./features/masters/master-detail.component').then((m) => m.MasterDetailComponent),
          },
          {
            path: ':sub/:id',
            data: { slug: 'inventory' },
            loadComponent: () => import('./features/views/record-view.component').then((m) => m.RecordViewComponent),
          },
          {
            path: ':sub',
            data: { slug: 'inventory' },
            loadComponent: () =>
              import('./features/module-workspace/module-workspace.component').then((m) => m.ModuleWorkspaceComponent),
          },
        ],
      },
      {
        // Finance module — Chart of Accounts + ledger reports. Declared before the
        // generic m/:slug route so these specific subs win.
        path: 'm/finance',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
          {
            path: 'chart-of-accounts',
            loadComponent: () =>
              import('./features/accounting/chart-of-accounts.component').then((m) => m.ChartOfAccountsComponent),
          },
          {
            path: 'ledger',
            loadComponent: () =>
              import('./features/accounting/general-ledger.component').then((m) => m.GeneralLedgerComponent),
          },
          {
            path: 'trial-balance',
            loadComponent: () =>
              import('./features/accounting/trial-balance.component').then((m) => m.TrialBalanceComponent),
          },
          {
            path: 'profit-loss',
            loadComponent: () =>
              import('./features/accounting/profit-loss.component').then((m) => m.ProfitLossComponent),
          },
          {
            path: 'balance-sheet',
            loadComponent: () =>
              import('./features/accounting/balance-sheet.component').then((m) => m.BalanceSheetComponent),
          },
          {
            path: 'payables',
            data: { kind: 'payables' },
            loadComponent: () =>
              import('./features/accounting/party-outstanding.component').then((m) => m.PartyOutstandingComponent),
          },
          {
            path: 'receivables',
            data: { kind: 'receivables' },
            loadComponent: () =>
              import('./features/accounting/party-outstanding.component').then((m) => m.PartyOutstandingComponent),
          },
          {
            path: 'period-close',
            loadComponent: () =>
              import('./features/accounting/period-close.component').then((m) => m.PeriodCloseComponent),
          },
          {
            path: 'fiscal-years',
            loadComponent: () =>
              import('./features/accounting/fiscal-year.component').then((m) => m.FiscalYearComponent),
          },
          {
            // finance document records (e.g. payments/PAY-2026-00001) → record view
            path: ':sub/:id',
            data: { slug: 'finance' },
            loadComponent: () =>
              import('./features/views/record-view.component').then((m) => m.RecordViewComponent),
          },
          {
            // dashboard / payments list / any other finance sub → generic workspace
            path: ':sub',
            data: { slug: 'finance' },
            loadComponent: () =>
              import('./features/module-workspace/module-workspace.component').then((m) => m.ModuleWorkspaceComponent),
          },
        ],
      },
      {
        path: 'm/:slug',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
          {
            path: ':sub',
            children: [
              {
                path: '',
                loadComponent: () =>
                  import('./features/module-workspace/module-workspace.component').then(
                    (m) => m.ModuleWorkspaceComponent,
                  ),
              },
              {
                path: ':id',
                loadComponent: () =>
                  import('./features/views/record-view.component').then((m) => m.RecordViewComponent),
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'app' },
  { path: '**', redirectTo: 'app' },
];

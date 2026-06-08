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

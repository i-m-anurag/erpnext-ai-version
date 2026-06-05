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
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'masters',
        canActivate: [permissionGuard],
        data: { permission: 'master:view', title: 'Masters' },
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/masters/masters-list.component').then((m) => m.MastersListComponent),
          },
          {
            path: ':slug',
            loadComponent: () =>
              import('./features/masters/master-detail.component').then((m) => m.MasterDetailComponent),
          },
        ],
      },
      {
        path: 'roles',
        canActivate: [permissionGuard],
        data: { permission: 'permission:role.read', title: 'Roles & Permissions' },
        loadComponent: () =>
          import('./features/placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'app' },
  { path: '**', redirectTo: 'app' },
];

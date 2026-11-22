import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    // Child routes swap only the center panel; the side panels stay mounted.
    path: '',
    loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/dashboard/search-panel.component').then((m) => m.SearchPanelComponent),
      },
      {
        path: 'resources/:id',
        loadComponent: () =>
          import('./features/resource-detail/resource-detail.component').then((m) => m.ResourceDetailComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

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
    // The dashboard shell (toolbar via AppComponent, left/right panels via
    // DashboardComponent itself) stays mounted across both child routes —
    // only its center-panel <router-outlet> swaps content. This is what
    // keeps my-posts/rankings visible and un-reloaded while viewing a
    // resource, rather than replacing the whole page.
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

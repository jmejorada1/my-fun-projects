import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Redirects to /login when no user is logged in (architecture.md §3). */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.currentUser() ? true : inject(Router).parseUrl('/login');
};

import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { DomainSelectionService } from './domain-selection.service';

/**
 * Adds X-Domain to every outgoing request — required by every
 * domain-scoped backend endpoint (backend/posts/docs/architecture.md §8.1).
 * The value comes from
 * whatever the user picked in the domain picker, not a fixed constant.
 */
export const domainHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  const domain = inject(DomainSelectionService).selectedDomain();
  return next(req.clone({ setHeaders: { 'X-Domain': domain } }));
};

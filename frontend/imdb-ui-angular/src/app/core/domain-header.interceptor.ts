import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { DomainSelectionService } from './domain-selection.service';

/** Domain-scoped endpoints require X-Domain (backend/posts/docs/architecture.md §8.1). */
export const domainHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  const domain = inject(DomainSelectionService).selectedDomain();
  return next(req.clone({ setHeaders: { 'X-Domain': domain } }));
};

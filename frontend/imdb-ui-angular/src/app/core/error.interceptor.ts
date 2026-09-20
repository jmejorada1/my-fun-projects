import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/** Shape of the backend's RFC 7807 ProblemDetail error body. */
interface ProblemDetail {
  detail?: string;
  title?: string;
  status?: number;
  errors?: Record<string, string>;
}

/**
 * Wraps every failed request in an {@link AppHttpError} carrying a
 * ready-to-display message, so components don't each need to know how to
 * unpack a ProblemDetail body (implementation-spec-spring-boot.md §11).
 */
export class AppHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      return throwError(() => toAppHttpError(error));
    }),
  );
};

function toAppHttpError(error: HttpErrorResponse): AppHttpError {
  if (error.status === 0) {
    return new AppHttpError('Could not reach the server. Check your connection and try again.', 0);
  }

  const problem = error.error as ProblemDetail | null;
  const message = problem?.detail ?? `Request failed (${error.status}).`;
  return new AppHttpError(message, error.status, problem?.errors);
}

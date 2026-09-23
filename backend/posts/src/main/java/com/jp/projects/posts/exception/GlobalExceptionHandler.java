package com.jp.projects.posts.exception;

import java.net.URI;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Every handler logs before responding. Nothing in this service used to
 * log at all, so a constraint violation — any of the dozen-plus
 * constraints in the schema — produced an opaque 409 with no server-side
 * record of which one fired. Expected 4xx outcomes log without a stack
 * trace (they're client errors, not incidents); anything unhandled logs at
 * {@code error} with the exception.
 *
 * <p>Extends {@link ResponseEntityExceptionHandler} so that Spring's own
 * MVC exceptions — a missing {@code X-Domain} header, unparseable JSON, a
 * non-numeric path variable, an unsupported method — keep their correct
 * 4xx statuses. Without it the {@link #handleUnexpected} catch-all below
 * would match them first and report every one as a 500.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    public ProblemDetail handleNotFound(NotFoundException ex) {
        log.debug("Not found: {}", ex.getMessage());
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(ForbiddenOperationException.class)
    public ProblemDetail handleForbidden(ForbiddenOperationException ex) {
        log.warn("Forbidden: {}", ex.getMessage());
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, ex.getMessage());
    }

    /**
     * Only our own {@link InvalidRequestException} maps to 400 here.
     * {@code IllegalArgumentException} used to, which meant any of the
     * many {@code IllegalArgumentException}s thrown by Spring, Hibernate
     * or the JDK to signal a *programmer* error was reported to the client
     * as a bad request, with the internal message as the body. Those now
     * fall through to {@link #handleUnexpected} as a 500, which is what
     * they are.
     */
    @ExceptionHandler(InvalidRequestException.class)
    public ProblemDetail handleInvalidRequest(InvalidRequestException ex) {
        log.debug("Invalid request: {}", ex.getMessage());
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    /**
     * The response stays deliberately generic — which constraint was
     * violated is an internal schema detail — but the cause is now logged
     * so a 409 in production is diagnosable.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        log.warn("Data integrity violation", ex);
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.CONFLICT, "The request conflicts with an existing resource or constraint");
    }

    /**
     * Catch-all so an unexpected failure is logged with its stack trace and
     * answered with a 500 that leaks nothing, rather than falling through
     * to the container's default error handling. The inherited handlers for
     * Spring's own MVC exceptions are more specific, so they still win.
     */
    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred");
    }

    /** Adds the per-field {@code errors} map the frontend reads. */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
                                                                   HttpHeaders headers, HttpStatusCode status,
                                                                   WebRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, "Validation failed for one or more fields");
        problem.setType(URI.create("about:blank"));
        problem.setProperty("errors", ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        FieldError::getField,
                        fieldError -> fieldError.getDefaultMessage() == null
                                ? "invalid" : fieldError.getDefaultMessage(),
                        (a, b) -> a)));
        log.debug("Validation failed: {}", problem.getProperties());
        return ResponseEntity.badRequest().body(problem);
    }

    /** One place to log every exception {@link ResponseEntityExceptionHandler} handles. */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
                                                              HttpStatusCode statusCode, WebRequest request) {
        if (statusCode.is5xxServerError()) {
            log.error("Request failed: {}", ex.getMessage(), ex);
        } else {
            log.debug("Request rejected ({}): {}", statusCode, ex.getMessage());
        }
        return super.handleExceptionInternal(ex, body, headers, statusCode, request);
    }
}

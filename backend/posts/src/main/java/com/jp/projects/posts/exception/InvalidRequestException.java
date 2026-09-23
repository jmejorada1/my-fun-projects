package com.jp.projects.posts.exception;

/**
 * A request that passed bean validation but violates a rule the annotations
 * can't express (e.g. two optional fields that must be supplied together).
 *
 * <p>Exists so {@link GlobalExceptionHandler} doesn't have to map
 * {@code IllegalArgumentException} to 400 wholesale. That mapping turned
 * every {@code IllegalArgumentException} thrown anywhere below the
 * controller — including the ones Spring, Hibernate and the JDK throw to
 * signal programmer error — into "your request was bad", with the internal
 * message as the response body.
 */
public class InvalidRequestException extends RuntimeException {

    public InvalidRequestException(String message) {
        super(message);
    }
}

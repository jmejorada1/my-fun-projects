package com.jp.projects.posts.exception;

/**
 * Renamed from {@code EntityNotFoundException}, which shadowed
 * {@code jakarta.persistence.EntityNotFoundException} — the same simple
 * name Hibernate itself throws, in a codebase that uses Hibernate
 * throughout. An unqualified import read ambiguously, and a later
 * {@code catch} could have caught the wrong one.
 */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }

    public static NotFoundException of(String entityName, Long id) {
        return new NotFoundException(entityName + " " + id + " not found");
    }
}

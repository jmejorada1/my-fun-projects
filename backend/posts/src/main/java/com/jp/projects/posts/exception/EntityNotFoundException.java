package com.jp.projects.posts.exception;

public class EntityNotFoundException extends RuntimeException {

    public EntityNotFoundException(String message) {
        super(message);
    }

    public static EntityNotFoundException of(String entityName, Long id) {
        return new EntityNotFoundException(entityName + " " + id + " not found");
    }
}

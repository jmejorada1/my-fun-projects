package com.jp.projects.posts.exception;

public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }

    public static NotFoundException of(String entityName, Long id) {
        return new NotFoundException(entityName + " " + id + " not found");
    }
}

package com.jp.projects.posts.exception;

/** A 400 for rules bean validation can't express, e.g. two fields that must come together. */
public class InvalidRequestException extends RuntimeException {

    public InvalidRequestException(String message) {
        super(message);
    }
}

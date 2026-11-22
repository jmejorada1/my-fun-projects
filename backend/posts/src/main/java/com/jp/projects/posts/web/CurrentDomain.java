package com.jp.projects.posts.web;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Injects the {@code X-Domain} header as a {@link com.jp.projects.posts.service.DomainRef}. A
 * missing header is a 400 and an unknown domain a 404.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface CurrentDomain {
}

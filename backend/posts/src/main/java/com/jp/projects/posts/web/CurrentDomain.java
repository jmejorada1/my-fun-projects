package com.jp.projects.posts.web;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Binds the resolved {@code X-Domain} header to a controller method
 * parameter of type {@link com.jp.projects.posts.service.DomainRef}.
 *
 * <p>Replaces the {@code @RequestHeader("X-Domain") String domain}
 * parameter that used to be repeated on every handler method, along with
 * the matching {@code domainService.requireByName(domain)} call at the top
 * of every service method — the header is now read, validated, and
 * resolved once per request by
 * {@code CurrentDomainArgumentResolver}. A missing header is a 400; an
 * unknown domain name is a 404, same as before.
 *
 * <p>The header stays visible in the OpenAPI document: {@code OpenApiConfig}
 * re-adds it to every operation whose handler has a parameter annotated
 * with this.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface CurrentDomain {
}

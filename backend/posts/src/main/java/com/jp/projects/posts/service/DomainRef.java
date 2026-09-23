package com.jp.projects.posts.service;

/**
 * The resolved {@code X-Domain} header, passed down through the service
 * layer instead of the raw header string.
 *
 * <p>Deliberately an immutable record rather than the {@link
 * com.jp.projects.posts.entity.Domain} entity: {@link
 * DomainService#requireByName} is cached, so the resolved value is shared
 * across threads and outlives any persistence context. A detached JPA
 * entity is the wrong thing to share that way.
 */
public record DomainRef(Long id, String name) {}

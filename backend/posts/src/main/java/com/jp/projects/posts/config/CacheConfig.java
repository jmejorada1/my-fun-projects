package com.jp.projects.posts.config;

import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Configuration;

/**
 * Enables caching for {@link
 * com.jp.projects.posts.service.DomainService#requireByName}, which every
 * domain-scoped request resolves through.
 *
 * <p>An in-memory {@code ConcurrentMapCacheManager} (Spring Boot's default
 * when no cache provider is on the classpath) is deliberate and
 * sufficient: {@code domain} holds a handful of rows that only a Flyway
 * migration ever changes, so entries never need eviction and per-instance
 * copies can't drift within a deployment. Introducing a new domain takes a
 * migration and therefore a restart, which clears the cache anyway.
 *
 * <p>The cache key is an unvalidated request header, but it cannot be used
 * to grow the cache without bound: an unknown name throws, and Spring does
 * not cache a method that threw, so only names that resolve to a real row
 * are ever stored.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    public static final String DOMAINS_BY_NAME = "domainsByName";
}

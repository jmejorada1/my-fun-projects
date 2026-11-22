package com.jp.projects.posts.config;

import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Configuration;

/**
 * The default in-memory cache is enough: domains only change by migration, which means a restart.
 * The key comes from a request header, but unknown names throw and aren't cached.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    public static final String DOMAINS_BY_NAME = "domainsByName";
}

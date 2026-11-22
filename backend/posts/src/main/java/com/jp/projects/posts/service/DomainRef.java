package com.jp.projects.posts.service;

/** A record, not the entity, because it's cached and shared across threads and sessions. */
public record DomainRef(Long id, String name) {}

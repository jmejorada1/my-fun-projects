package com.jp.projects.posts.dto.user;

import java.time.Instant;

// Temporary, dev-only (implementation-spec-spring-boot.md §8)
public record AppUserResponse(
        Long id, String username, String email,
        String firstName, String lastName,
        Instant createdAt, Instant updatedAt
) {}

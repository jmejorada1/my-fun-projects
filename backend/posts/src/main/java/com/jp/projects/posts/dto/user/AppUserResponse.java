package com.jp.projects.posts.dto.user;

import java.time.Instant;

// Temporary, dev-only (architecture.md §5)
public record AppUserResponse(
        Long id, String username, String email,
        String firstName, String lastName,
        Instant createdAt, Instant updatedAt
) {}

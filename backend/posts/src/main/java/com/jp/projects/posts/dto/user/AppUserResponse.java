package com.jp.projects.posts.dto.user;

import java.time.Instant;

public record AppUserResponse(
        Long id, String username, String email,
        String firstName, String lastName,
        Instant createdAt, Instant updatedAt
) {}

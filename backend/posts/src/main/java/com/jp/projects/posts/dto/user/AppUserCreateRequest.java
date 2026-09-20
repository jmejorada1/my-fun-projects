package com.jp.projects.posts.dto.user;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;

// Temporary, dev-only (implementation-spec-spring-boot.md §8). Backs
// registration (§19) — username and email are both explicitly collected
// on the register form, so both are required here.
public record AppUserCreateRequest(
        @NotBlank @Size(max = 64) String username,
        @NotBlank @Email @Size(max = 255) String email,
        @Size(max = 128) String firstName,
        @Size(max = 128) String lastName,
        Map<String, Object> data
) {}

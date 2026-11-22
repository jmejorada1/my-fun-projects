package com.jp.projects.posts.dto.user;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;

public record AppUserCreateRequest(
        @NotBlank @Size(max = 64) String username,
        @NotBlank @Email @Size(max = 255) String email,
        @Size(max = 128) String firstName,
        @Size(max = 128) String lastName,
        Map<String, Object> data
) {}

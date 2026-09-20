package com.jp.projects.posts.dto.resource;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Map;

public record ResourceCreateRequest(
        @NotBlank @Size(max = 32) String name,
        @NotBlank @Size(max = 512) String displayName,
        @NotNull Long categoryId,
        Map<String, Object> data
) {}

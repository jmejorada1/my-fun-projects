package com.jp.projects.posts.dto.post;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record TopLevelPostCreateRequest(
        @NotNull Long userId,          // see the ownership caveat in architecture.md §5
        @NotBlank String bodyText,
        Map<String, Object> data
) {}

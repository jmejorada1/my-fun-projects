package com.jp.projects.posts.dto.post;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record ReplyCreateRequest(
        @NotNull Long userId,          // see the ownership caveat in implementation-spec-spring-boot.md §8
        @NotBlank String bodyText,
        Map<String, Object> data
) {}

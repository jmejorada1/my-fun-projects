package com.jp.projects.posts.dto.post;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record PostUpdateRequest(
        @NotNull Long userId,          // see the ownership caveat in implementation-spec-spring-boot.md §8
        @NotBlank String bodyText
) {}

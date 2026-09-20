package com.jp.projects.posts.dto.postflag;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record PostFlagCreateRequest(
        @NotNull Long userId,          // see the ownership caveat in implementation-spec-spring-boot.md §8
        @NotNull Long postTypeId,
        @NotNull @Min(0) @Max(5) Integer score          // 0 = neutral
) {}

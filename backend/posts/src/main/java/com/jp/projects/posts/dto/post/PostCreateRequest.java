package com.jp.projects.posts.dto.post;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

/** A reply when {@code parentPostId} is set. {@code postTypeId} and {@code score} come together or not at all. */
public record PostCreateRequest(
        @NotBlank String username,
        @NotNull Long resourceId,
        Long parentPostId,
        @NotBlank String bodyText,
        Long postTypeId,
        @Min(0) @Max(5) Integer score,          // 0 = neutral
        Map<String, Object> data
) {}

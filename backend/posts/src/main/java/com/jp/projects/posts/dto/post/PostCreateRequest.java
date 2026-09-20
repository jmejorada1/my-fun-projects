package com.jp.projects.posts.dto.post;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

/**
 * Unified post-creation request: a top-level post when {@code parentPostId}
 * is omitted, a reply when it's present (the server derives the effective
 * resourceId from the parent in that case — see PostService.createPost).
 * {@code postTypeId}/{@code score} are optional and must be provided
 * together; when given, a flag is applied to the new post in the same
 * transaction.
 */
public record PostCreateRequest(
        @NotBlank String username,
        @NotNull Long resourceId,
        Long parentPostId,
        @NotBlank String bodyText,
        Long postTypeId,
        @Min(0) @Max(5) Integer score,          // 0 = neutral
        Map<String, Object> data
) {}

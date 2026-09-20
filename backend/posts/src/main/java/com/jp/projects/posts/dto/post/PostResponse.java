package com.jp.projects.posts.dto.post;

import com.jp.projects.posts.dto.postflag.PostFlagResponse;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Intentionally omits a nested {@code replies} field — same reason the
 * entity has no {@code @OneToMany}: replies are fetched via the separate
 * paginated endpoint.
 *
 * {@code flags}, {@code replyCount}, and {@code resourceDisplayName} are
 * only populated by the list endpoints (top-level posts, replies,
 * by-user), which batch-load them alongside the page — most usefully for
 * by-user, whose posts can span many different resources/movies; single-
 * post reads/writes leave these unset since the caller is already on that
 * resource's page and doesn't need it repeated back.
 */
public record PostResponse(
        Long id,
        Long resourceId,
        Long userId,
        String username,
        Long parentPostId,
        String bodyText,
        Map<String, Object> data,
        Instant createdAt,
        Instant updatedAt,
        List<PostFlagResponse> flags,
        long replyCount,
        String resourceDisplayName
) {}

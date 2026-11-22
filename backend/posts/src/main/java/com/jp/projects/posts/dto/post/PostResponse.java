package com.jp.projects.posts.dto.post;

import com.jp.projects.posts.dto.postflag.PostFlagResponse;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * No nested replies; they're paginated separately. {@code flags}, {@code replyCount} and
 * {@code resourceDisplayName} are only set by the list endpoints.
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

package com.jp.projects.posts.dto.resource;

import com.jp.projects.posts.dto.category.ResourceCategoryResponse;
import java.time.Instant;
import java.util.List;

/**
 * {@code postCount} and {@code flagSummary} count posts/flags at any depth
 * (top-level posts and replies alike) — same scope as {@code /rankings} —
 * so they include flags the resource-detail page's own top-level-only post
 * list can't see (e.g. a reply-only flag). Populated on both the
 * single-resource read and the list/search endpoint (ResourceService.get /
 * .list).
 */
public record ResourceResponse(
        Long id,
        String name,
        String displayName,
        ResourceCategoryResponse category,
        Instant createdAt,
        Instant updatedAt,
        long postCount,
        List<ResourceFlagSummaryEntry> flagSummary
) {}

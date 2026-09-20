package com.jp.projects.posts.dto.resource;

import com.jp.projects.posts.dto.category.ResourceCategoryResponse;
import java.time.Instant;
import java.util.List;

/**
 * {@code postCount} and {@code flagSummary} are only populated by the
 * list/search endpoint (batch-loaded alongside the page, like
 * PostResponse's flags/replyCount) — a single-resource read leaves them
 * at their defaults since the resource-detail page already computes its
 * own summary from the posts it separately loads.
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

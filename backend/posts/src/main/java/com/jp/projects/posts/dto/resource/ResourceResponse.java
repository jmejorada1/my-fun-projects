package com.jp.projects.posts.dto.resource;

import com.jp.projects.posts.dto.category.ResourceCategoryResponse;
import java.time.Instant;
import java.util.List;

/** {@code postCount} and {@code flagSummary} include replies, like {@code /rankings}. */
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

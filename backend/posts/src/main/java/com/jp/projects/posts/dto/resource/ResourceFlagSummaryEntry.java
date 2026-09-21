package com.jp.projects.posts.dto.resource;

/**
 * One category's aggregate over a resource's active flags, at any post
 * depth (top-level posts and replies alike) — populated on both the
 * single-resource read and the list/search endpoint (see
 * ResourceService.get/list). Deliberately just data: the backend has no
 * notion of "no-bigotry" being special (that's a frontend-only display
 * rule), so `averageScore` is always the plain AVG(score), 0.0 included.
 */
public record ResourceFlagSummaryEntry(
        String postTypeName,
        double averageScore,
        long flagCount
) {}

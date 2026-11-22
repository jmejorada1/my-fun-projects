package com.jp.projects.posts.dto.resource;

/** Covers flags on replies too. {@code averageScore} is a plain average; no post type is special here. */
public record ResourceFlagSummaryEntry(
        String postTypeName,
        double averageScore,
        long flagCount
) {}

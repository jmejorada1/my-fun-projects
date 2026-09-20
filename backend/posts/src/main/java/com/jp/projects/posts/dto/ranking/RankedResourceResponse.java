package com.jp.projects.posts.dto.ranking;

public record RankedResourceResponse(
        RankingResourceSummary resource,
        Double averageScore,
        Long flagCount
) {}

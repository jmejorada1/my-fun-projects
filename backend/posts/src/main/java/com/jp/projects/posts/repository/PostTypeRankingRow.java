package com.jp.projects.posts.repository;

/**
 * Interface projection for {@link PostFlagRepository#findTopRankedResourcesByPostType},
 * one row per (post_type, resource) pair already limited to the top 5 per
 * post_type — see architecture.md §5.
 */
public interface PostTypeRankingRow {

    Long getPostTypeId();

    String getPostTypeName();

    Long getResourceId();

    String getResourceName();

    String getResourceDisplayName();

    Double getAvgScore();

    Long getFlagCount();
}

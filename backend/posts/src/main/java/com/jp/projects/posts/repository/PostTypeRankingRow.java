package com.jp.projects.posts.repository;

public interface PostTypeRankingRow {

    Long getPostTypeId();

    String getPostTypeName();

    Long getResourceId();

    String getResourceName();

    String getResourceDisplayName();

    Double getAvgScore();

    Long getFlagCount();
}

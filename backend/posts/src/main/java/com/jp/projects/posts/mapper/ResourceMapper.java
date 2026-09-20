package com.jp.projects.posts.mapper;

import com.jp.projects.posts.dto.category.ResourceCategoryResponse;
import com.jp.projects.posts.dto.resource.ResourceFlagSummaryEntry;
import com.jp.projects.posts.dto.resource.ResourceResponse;
import com.jp.projects.posts.entity.Resource;
import com.jp.projects.posts.entity.ResourceCategory;
import java.util.List;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface ResourceMapper {

    @Mapping(target = "postCount", constant = "0L")
    @Mapping(target = "flagSummary", expression = "java(java.util.List.of())")
    ResourceResponse toResponse(Resource resource);

    /** Same mapping, plus the resource's batch-loaded stats — see ResourceService.list. */
    @Mapping(target = "postCount", source = "postCount")
    @Mapping(target = "flagSummary", source = "flagSummary")
    ResourceResponse toResponse(Resource resource, long postCount, List<ResourceFlagSummaryEntry> flagSummary);

    ResourceCategoryResponse toResponse(ResourceCategory category);
}

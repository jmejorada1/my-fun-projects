package com.jp.projects.posts.mapper;

import com.jp.projects.posts.dto.resource.ResourceFlagSummaryEntry;
import com.jp.projects.posts.dto.resource.ResourceResponse;
import com.jp.projects.posts.entity.Resource;
import java.util.List;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring", uses = ResourceCategoryMapper.class)
public interface ResourceMapper {

    /** Only for a just-created resource, which really has no posts. */
    @Mapping(target = "postCount", constant = "0L")
    @Mapping(target = "flagSummary", expression = "java(java.util.List.of())")
    ResourceResponse toResponse(Resource resource);

    @Mapping(target = "postCount", source = "postCount")
    @Mapping(target = "flagSummary", source = "flagSummary")
    ResourceResponse toResponse(Resource resource, long postCount, List<ResourceFlagSummaryEntry> flagSummary);
}

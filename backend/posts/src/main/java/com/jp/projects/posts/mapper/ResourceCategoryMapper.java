package com.jp.projects.posts.mapper;

import com.jp.projects.posts.dto.category.ResourceCategoryResponse;
import com.jp.projects.posts.entity.ResourceCategory;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface ResourceCategoryMapper {

    ResourceCategoryResponse toResponse(ResourceCategory category);
}

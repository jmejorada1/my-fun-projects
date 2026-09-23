package com.jp.projects.posts.mapper;

import com.jp.projects.posts.dto.category.ResourceCategoryResponse;
import com.jp.projects.posts.entity.ResourceCategory;
import org.mapstruct.Mapper;

/**
 * Split out of {@code ResourceMapper}, which {@code ResourceCategoryService}
 * used to inject solely for this one method. {@code ResourceMapper} still
 * maps the nested category inside a {@code ResourceResponse} — it does so
 * through this mapper via {@code uses}.
 */
@Mapper(componentModel = "spring")
public interface ResourceCategoryMapper {

    ResourceCategoryResponse toResponse(ResourceCategory category);
}

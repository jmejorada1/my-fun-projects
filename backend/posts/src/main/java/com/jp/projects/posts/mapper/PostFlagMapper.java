package com.jp.projects.posts.mapper;

import com.jp.projects.posts.dto.postflag.PostFlagResponse;
import com.jp.projects.posts.entity.PostFlag;
import org.mapstruct.Mapper;

/**
 * Maps the nested {@code postType} through {@link PostTypeMapper} rather
 * than a second {@code toResponse} overload of its own — that overload was
 * the only reason {@code PostTypeService} injected this flag mapper.
 */
@Mapper(componentModel = "spring", uses = PostTypeMapper.class)
public interface PostFlagMapper {

    PostFlagResponse toResponse(PostFlag postFlag);
}

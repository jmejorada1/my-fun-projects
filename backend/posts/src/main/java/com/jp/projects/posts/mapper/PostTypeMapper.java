package com.jp.projects.posts.mapper;

import com.jp.projects.posts.dto.posttype.PostTypeResponse;
import com.jp.projects.posts.entity.PostType;
import org.mapstruct.Mapper;

/**
 * The single way to turn a {@link PostType} into a {@link
 * PostTypeResponse}. Previously there were three: a method bolted onto
 * {@code PostFlagMapper} (which {@code PostTypeService} injected despite
 * having nothing to do with flags), and a hand-rolled constructor call in
 * {@code RankingService}.
 */
@Mapper(componentModel = "spring")
public interface PostTypeMapper {

    PostTypeResponse toResponse(PostType postType);
}

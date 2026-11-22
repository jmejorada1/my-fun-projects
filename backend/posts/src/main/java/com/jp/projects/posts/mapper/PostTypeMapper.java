package com.jp.projects.posts.mapper;

import com.jp.projects.posts.dto.posttype.PostTypeResponse;
import com.jp.projects.posts.entity.PostType;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface PostTypeMapper {

    PostTypeResponse toResponse(PostType postType);
}

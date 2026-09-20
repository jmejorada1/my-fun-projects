package com.jp.projects.posts.mapper;

import com.jp.projects.posts.dto.postflag.PostFlagResponse;
import com.jp.projects.posts.dto.posttype.PostTypeResponse;
import com.jp.projects.posts.entity.PostFlag;
import com.jp.projects.posts.entity.PostType;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface PostFlagMapper {

    PostFlagResponse toResponse(PostFlag postFlag);

    PostTypeResponse toResponse(PostType postType);
}

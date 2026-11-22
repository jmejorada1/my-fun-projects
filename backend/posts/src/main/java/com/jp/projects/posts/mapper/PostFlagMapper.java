package com.jp.projects.posts.mapper;

import com.jp.projects.posts.dto.postflag.PostFlagResponse;
import com.jp.projects.posts.entity.PostFlag;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring", uses = PostTypeMapper.class)
public interface PostFlagMapper {

    PostFlagResponse toResponse(PostFlag postFlag);
}

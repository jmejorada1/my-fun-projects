package com.jp.projects.posts.mapper;

import com.jp.projects.posts.dto.post.PostResponse;
import com.jp.projects.posts.dto.postflag.PostFlagResponse;
import com.jp.projects.posts.entity.Post;
import java.util.List;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface PostMapper {

    /** A newly built post needs {@code user} set, since there's no lazy proxy to load it. */
    @Mapping(target = "username", source = "user.username")
    @Mapping(target = "flags", expression = "java(java.util.List.of())")
    @Mapping(target = "replyCount", constant = "0L")
    @Mapping(target = "resourceDisplayName", ignore = true)
    PostResponse toResponse(Post post);

    /** For the list endpoints (see PostService.toResponsePage). */
    @Mapping(target = "username", source = "post.user.username")
    @Mapping(target = "flags", source = "flags")
    @Mapping(target = "replyCount", source = "replyCount")
    @Mapping(target = "resourceDisplayName", source = "resourceDisplayName")
    PostResponse toResponse(Post post, List<PostFlagResponse> flags, long replyCount, String resourceDisplayName);
}

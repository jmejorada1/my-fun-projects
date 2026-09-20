package com.jp.projects.posts.mapper;

import com.jp.projects.posts.dto.post.PostResponse;
import com.jp.projects.posts.dto.postflag.PostFlagResponse;
import com.jp.projects.posts.entity.Post;
import java.util.List;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface PostMapper {

    /**
     * {@code user} must be populated on {@code post} for this to work —
     * either a real loaded entity (reads: always true) or explicitly set
     * on the builder before mapping (creates: PostService sets it from the
     * already-resolved/looked-up author, since a freshly built entity has
     * no lazy proxy to fall back on).
     */
    @Mapping(target = "username", source = "user.username")
    @Mapping(target = "flags", expression = "java(java.util.List.of())")
    @Mapping(target = "replyCount", constant = "0L")
    @Mapping(target = "resourceDisplayName", ignore = true)
    PostResponse toResponse(Post post);

    /** Same mapping, plus the post's batch-loaded flags/reply count/resource title — see PostService.mapWithFlags. */
    @Mapping(target = "username", source = "post.user.username")
    @Mapping(target = "flags", source = "flags")
    @Mapping(target = "replyCount", source = "replyCount")
    @Mapping(target = "resourceDisplayName", source = "resourceDisplayName")
    PostResponse toResponse(Post post, List<PostFlagResponse> flags, long replyCount, String resourceDisplayName);
}

package com.jp.projects.posts.dto.postflag;

import com.jp.projects.posts.dto.posttype.PostTypeResponse;
import java.time.Instant;

public record PostFlagResponse(
        Long id,
        Long postId,
        PostTypeResponse postType,
        Short score,
        Instant createdAt,
        Instant updatedAt
) {}

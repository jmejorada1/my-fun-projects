package com.jp.projects.posts.dto.post;

import com.jp.projects.posts.dto.postflag.PostFlagResponse;

public record PostCreateResponse(
        PostResponse post,
        PostFlagResponse flag
) {}

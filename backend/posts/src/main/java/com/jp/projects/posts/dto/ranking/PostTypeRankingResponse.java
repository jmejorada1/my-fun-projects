package com.jp.projects.posts.dto.ranking;

import com.jp.projects.posts.dto.posttype.PostTypeResponse;
import java.util.List;

public record PostTypeRankingResponse(
        PostTypeResponse postType,
        List<RankedResourceResponse> resources
) {}

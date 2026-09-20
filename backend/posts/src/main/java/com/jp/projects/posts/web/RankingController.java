package com.jp.projects.posts.web;

import com.jp.projects.posts.dto.ranking.PostTypeRankingResponse;
import com.jp.projects.posts.service.RankingService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Deliberately domain-agnostic (design-spec.md §3.5): no
 * {@code imdb}/{@code bigotry}-specific vocabulary here — {@code X-Domain}
 * alone determines which domain's {@code post_type} rows get ranked.
 */
@RestController
@RequestMapping("/rankings")
@RequiredArgsConstructor
public class RankingController {

    private final RankingService rankingService;

    @GetMapping
    public List<PostTypeRankingResponse> list(@RequestHeader("X-Domain") String domain) {
        return rankingService.getRankings(domain);
    }
}

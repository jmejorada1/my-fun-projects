package com.jp.projects.posts.web;

import com.jp.projects.posts.dto.ranking.PostTypeRankingResponse;
import com.jp.projects.posts.service.DomainRef;
import com.jp.projects.posts.service.RankingService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/rankings")
@RequiredArgsConstructor
public class RankingController {

    private final RankingService rankingService;

    @GetMapping
    public List<PostTypeRankingResponse> list(@CurrentDomain DomainRef domain) {
        return rankingService.getRankings(domain);
    }
}

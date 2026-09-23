package com.jp.projects.posts.service;

import com.jp.projects.posts.dto.ranking.PostTypeRankingResponse;
import com.jp.projects.posts.dto.ranking.RankedResourceResponse;
import com.jp.projects.posts.dto.ranking.RankingResourceSummary;
import com.jp.projects.posts.mapper.PostTypeMapper;
import com.jp.projects.posts.repository.PostFlagRepository;
import com.jp.projects.posts.repository.PostTypeRankingRow;
import com.jp.projects.posts.repository.PostTypeRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class RankingService {

    private final PostTypeRepository postTypeRepository;
    private final PostFlagRepository postFlagRepository;
    private final PostTypeMapper postTypeMapper;

    /**
     * design-spec.md §3.5 — one entry per {@code post_type} in the domain
     * (even ones with no flags yet, which get an empty {@code resources}
     * list), each with its top-5 ranked resources.
     */
    public List<PostTypeRankingResponse> getRankings(DomainRef domain) {
        Long domainId = domain.id();

        Map<Long, List<PostTypeRankingRow>> rowsByPostType = postFlagRepository
                .findTopRankedResourcesByPostType(domainId).stream()
                .collect(Collectors.groupingBy(PostTypeRankingRow::getPostTypeId, LinkedHashMap::new, Collectors.toList()));

        return postTypeRepository.findAllByDomainId(domainId).stream()
                .map(postType -> new PostTypeRankingResponse(
                        postTypeMapper.toResponse(postType),
                        rowsByPostType.getOrDefault(postType.getId(), List.of()).stream()
                                .map(this::toRankedResource)
                                .toList()))
                .toList();
    }

    private RankedResourceResponse toRankedResource(PostTypeRankingRow row) {
        return new RankedResourceResponse(
                new RankingResourceSummary(row.getResourceId(), row.getResourceName(), row.getResourceDisplayName()),
                row.getAvgScore(),
                row.getFlagCount());
    }
}

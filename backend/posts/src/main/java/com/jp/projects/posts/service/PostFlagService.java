package com.jp.projects.posts.service;

import com.jp.projects.posts.dto.postflag.PostFlagCreateRequest;
import com.jp.projects.posts.dto.postflag.PostFlagResponse;
import com.jp.projects.posts.entity.Post;
import com.jp.projects.posts.entity.PostFlag;
import com.jp.projects.posts.exception.ForbiddenOperationException;
import com.jp.projects.posts.exception.NotFoundException;
import com.jp.projects.posts.mapper.PostFlagMapper;
import com.jp.projects.posts.repository.PostFlagRepository;
import com.jp.projects.posts.repository.PostRepository;
import com.jp.projects.posts.repository.PostTypeRepository;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class PostFlagService {

    private final PostFlagRepository postFlagRepository;
    private final PostRepository postRepository;
    private final PostTypeRepository postTypeRepository;
    private final PostFlagMapper postFlagMapper;

    @Transactional
    public PostFlagResponse addOrUpdateFlag(Long postId, PostFlagCreateRequest request, DomainRef domain) {
        Long domainId = domain.id();
        requireActivePost(postId, domainId);
        postTypeRepository.findByIdAndDomainId(request.postTypeId(), domainId)
                .orElseThrow(() -> NotFoundException.of("PostType", request.postTypeId()));

        // `request.userId()` is accepted per the unenforced-acting-user
        // pattern (architecture.md §5) but post_flag has
        // no user_id column to persist it against — flags aren't tied to a
        // specific flagger in the schema.
        //
        // A single native upsert, not a check-then-insert/update: two
        // concurrent calls could both observe "no active flag" and race on
        // the partial unique index otherwise.
        postFlagRepository.upsertActiveFlag(postId, request.postTypeId(), request.score().shortValue(), domainId);

        PostFlag flag = postFlagRepository
                .findByPostIdAndPostTypeIdAndDeletedAtIsNull(postId, request.postTypeId())
                .orElseThrow(() -> new IllegalStateException(
                        "Upserted flag not found for post " + postId + " / type " + request.postTypeId()));
        return postFlagMapper.toResponse(flag);
    }

    public List<PostFlagResponse> listActiveFlags(Long postId, DomainRef domain) {
        requireActivePost(postId, domain.id());
        return postFlagRepository.findByPostIdAndDeletedAtIsNull(postId).stream()
                .map(postFlagMapper::toResponse)
                .toList();
    }

    @Transactional
    public void removeFlag(Long flagId, Long actingUserId, DomainRef domain) {
        Long domainId = domain.id();
        PostFlag flag = postFlagRepository.findById(flagId)
                .filter(f -> f.getDeletedAt() == null && f.getDomainId().equals(domainId))
                .orElseThrow(() -> NotFoundException.of("PostFlag", flagId));

        Post post = postRepository.findByIdAndDomainIdAndDeletedAtIsNull(flag.getPostId(), domainId)
                .orElseThrow(() -> NotFoundException.of("Post", flag.getPostId()));

        if (!post.getUserId().equals(actingUserId)) {
            throw new ForbiddenOperationException(
                    "User " + actingUserId + " is not the author of post " + post.getId());
        }
        flag.setDeletedAt(Instant.now());
    }

    private void requireActivePost(Long postId, Long domainId) {
        postRepository.findByIdAndDomainIdAndDeletedAtIsNull(postId, domainId)
                .orElseThrow(() -> NotFoundException.of("Post", postId));
    }
}

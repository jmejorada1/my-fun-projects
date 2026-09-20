package com.jp.projects.posts.service;

import com.jp.projects.posts.dto.post.PostCreateRequest;
import com.jp.projects.posts.dto.post.PostCreateResponse;
import com.jp.projects.posts.dto.post.PostResponse;
import com.jp.projects.posts.dto.post.PostUpdateRequest;
import com.jp.projects.posts.dto.post.ReplyCreateRequest;
import com.jp.projects.posts.dto.post.TopLevelPostCreateRequest;
import com.jp.projects.posts.dto.postflag.PostFlagCreateRequest;
import com.jp.projects.posts.dto.postflag.PostFlagResponse;
import com.jp.projects.posts.entity.AppUser;
import com.jp.projects.posts.entity.Post;
import com.jp.projects.posts.entity.Resource;
import com.jp.projects.posts.exception.EntityNotFoundException;
import com.jp.projects.posts.exception.ForbiddenOperationException;
import com.jp.projects.posts.mapper.PostFlagMapper;
import com.jp.projects.posts.mapper.PostMapper;
import com.jp.projects.posts.repository.AppUserRepository;
import com.jp.projects.posts.repository.PostFlagRepository;
import com.jp.projects.posts.repository.PostRepository;
import com.jp.projects.posts.repository.ResourceRepository;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class PostService {

    private final PostRepository postRepository;
    private final ResourceRepository resourceRepository;
    private final AppUserRepository appUserRepository;
    private final PostFlagService postFlagService;
    private final PostFlagRepository postFlagRepository;
    private final PostMapper postMapper;
    private final PostFlagMapper postFlagMapper;
    private final DomainService domainService;

    /**
     * Unified creation entry point: a top-level post when
     * {@code parentPostId} is omitted, a reply when it's present (the
     * effective resourceId is then derived from the parent, same rule as
     * {@link #createReply} — any client-supplied resourceId is ignored in
     * that case). Identifies the author by username rather than userId.
     * When {@code postTypeId} is given (score is required alongside it),
     * a flag is applied to the new post in the same transaction.
     */
    @Transactional
    public PostCreateResponse createPost(PostCreateRequest request, String domain) {
        if ((request.postTypeId() == null) != (request.score() == null)) {
            throw new IllegalArgumentException("postTypeId and score must be provided together");
        }
        Long domainId = domainService.requireByName(domain).getId();

        AppUser author = appUserRepository.findByDomainIdAndUsername(domainId, request.username())
                .orElseThrow(() -> new EntityNotFoundException(
                        "AppUser with username '" + request.username() + "' not found"));

        Long effectiveResourceId;
        if (request.parentPostId() != null) {
            Post parent = getActive(request.parentPostId(), domainId);
            effectiveResourceId = parent.getResourceId();
        } else {
            resourceRepository.findByIdAndDomainIdAndDeletedAtIsNull(request.resourceId(), domainId)
                    .orElseThrow(() -> EntityNotFoundException.of("Resource", request.resourceId()));
            effectiveResourceId = request.resourceId();
        }

        Post post = Post.builder()
                .domainId(domainId)
                .resourceId(effectiveResourceId)
                .parentPostId(request.parentPostId())
                .userId(author.getId())
                .user(author)
                .bodyText(request.bodyText())
                .data(request.data())
                .build();
        post = postRepository.save(post);

        PostFlagResponse flag = null;
        if (request.postTypeId() != null) {
            flag = postFlagService.addOrUpdateFlag(post.getId(),
                    new PostFlagCreateRequest(author.getId(), request.postTypeId(), request.score()), domain);
        }

        return new PostCreateResponse(postMapper.toResponse(post), flag);
    }

    @Transactional
    public PostResponse createTopLevelPost(Long resourceId, TopLevelPostCreateRequest request, String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        resourceRepository.findByIdAndDomainIdAndDeletedAtIsNull(resourceId, domainId)
                .orElseThrow(() -> EntityNotFoundException.of("Resource", resourceId));
        AppUser author = requireUserInDomain(request.userId(), domainId);

        Post post = Post.builder()
                .domainId(domainId)
                .resourceId(resourceId)
                .parentPostId(null)
                .userId(request.userId())
                .user(author)
                .bodyText(request.bodyText())
                .data(request.data())
                .build();
        return postMapper.toResponse(postRepository.save(post));
    }

    @Transactional
    public PostResponse createReply(Long parentPostId, ReplyCreateRequest request, String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        Post parent = getActive(parentPostId, domainId);
        AppUser author = requireUserInDomain(request.userId(), domainId);

        // A reply inherits its thread's resource — derived server-side, not
        // accepted from the client (design-spec.md §2).
        Post reply = Post.builder()
                .domainId(domainId)
                .resourceId(parent.getResourceId())
                .parentPostId(parentPostId)
                .userId(request.userId())
                .user(author)
                .bodyText(request.bodyText())
                .data(request.data())
                .build();
        return postMapper.toResponse(postRepository.save(reply));
    }

    public PostResponse get(Long postId, String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        return postMapper.toResponse(getActive(postId, domainId));
    }

    public Page<PostResponse> listTopLevel(Long resourceId, String domain, Pageable pageable) {
        Long domainId = domainService.requireByName(domain).getId();
        resourceRepository.findByIdAndDomainIdAndDeletedAtIsNull(resourceId, domainId)
                .orElseThrow(() -> EntityNotFoundException.of("Resource", resourceId));
        return mapWithFlags(postRepository
                .findByDomainIdAndResourceIdAndParentPostIdIsNullAndDeletedAtIsNull(domainId, resourceId, pageable));
    }

    public Page<PostResponse> listReplies(Long parentPostId, String domain, Pageable pageable) {
        Long domainId = domainService.requireByName(domain).getId();
        getActive(parentPostId, domainId);
        return mapWithFlags(postRepository
                .findByDomainIdAndParentPostIdAndDeletedAtIsNull(domainId, parentPostId, pageable));
    }

    /** All posts (top-level + replies) authored by a user — design-spec.md §3.4. */
    public Page<PostResponse> listByUser(Long userId, String domain, Pageable pageable) {
        Long domainId = domainService.requireByName(domain).getId();
        requireUserInDomain(userId, domainId);
        return mapWithFlags(postRepository
                .findByDomainIdAndUserIdAndDeletedAtIsNull(domainId, userId, pageable));
    }

    /**
     * Batch-loads a page's post flags, reply counts, and resource titles in
     * three queries total (avoiding N+1) and attaches each post's to its
     * mapped response — list endpoints show a post's category/score, reply
     * count, and (most usefully for by-user, which spans many resources)
     * movie title inline; single-post reads/writes don't need any of it.
     */
    private Page<PostResponse> mapWithFlags(Page<Post> posts) {
        List<Long> postIds = posts.getContent().stream().map(Post::getId).toList();
        Map<Long, List<PostFlagResponse>> flagsByPostId = postIds.isEmpty()
                ? Map.of()
                : postFlagRepository.findByPostIdInAndDeletedAtIsNull(postIds).stream()
                        .map(postFlagMapper::toResponse)
                        .collect(Collectors.groupingBy(PostFlagResponse::postId));
        Map<Long, Long> replyCountByPostId = postIds.isEmpty()
                ? Map.of()
                : postRepository.countActiveRepliesByParentPostIdIn(postIds).stream()
                        .collect(Collectors.toMap(PostRepository.ReplyCount::getParentPostId,
                                PostRepository.ReplyCount::getReplyCount));
        List<Long> resourceIds = posts.getContent().stream().map(Post::getResourceId).distinct().toList();
        Map<Long, String> resourceDisplayNameById = resourceIds.isEmpty()
                ? Map.of()
                : resourceRepository.findAllById(resourceIds).stream()
                        .collect(Collectors.toMap(Resource::getId, Resource::getDisplayName));
        return posts.map(post -> postMapper.toResponse(post,
                flagsByPostId.getOrDefault(post.getId(), List.of()),
                replyCountByPostId.getOrDefault(post.getId(), 0L),
                resourceDisplayNameById.get(post.getResourceId())));
    }

    @Transactional
    public PostResponse updatePostText(Long postId, PostUpdateRequest request, String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        Post post = getActive(postId, domainId);
        requireOwner(post, request.userId());
        // Silently overwrites body_text in place — no edit history, per the
        // confirmed decision (design-spec.md §6).
        post.setBodyText(request.bodyText());
        return postMapper.toResponse(post);
    }

    @Transactional
    public void deletePost(Long postId, Long actingUserId, String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        Post post = getActive(postId, domainId);
        requireOwner(post, actingUserId);
        // Ownership check and cascade run in the same transaction as the
        // @Modifying query requires an existing one, and a failed cascade
        // shouldn't leave the root post's delete standing on its own.
        postRepository.softDeleteSubtree(postId);
    }

    private Post getActive(Long postId, Long domainId) {
        return postRepository.findByIdAndDomainIdAndDeletedAtIsNull(postId, domainId)
                .orElseThrow(() -> EntityNotFoundException.of("Post", postId));
    }

    /**
     * Explicit cross-domain author check for the endpoints that take a raw
     * {@code userId} rather than resolving one by username within this
     * domain already (domain-scoping-spec.md D13) — the unified
     * {@code createPost} entry point gets this for free from its
     * domain-scoped username lookup instead. Returns the resolved
     * {@link AppUser} so callers building a new {@code Post} can set its
     * {@code user} association (needed for {@code PostMapper} to include
     * {@code username} in the response — a freshly built entity has no
     * lazy proxy to fall back on).
     */
    private AppUser requireUserInDomain(Long userId, Long domainId) {
        return appUserRepository.findByIdAndDomainId(userId, domainId)
                .orElseThrow(() -> EntityNotFoundException.of("AppUser", userId));
    }

    private void requireOwner(Post post, Long actingUserId) {
        if (!post.getUserId().equals(actingUserId)) {
            throw new ForbiddenOperationException(
                    "User " + actingUserId + " does not own post " + post.getId());
        }
    }
}

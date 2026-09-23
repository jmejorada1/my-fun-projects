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
import com.jp.projects.posts.exception.ForbiddenOperationException;
import com.jp.projects.posts.exception.InvalidRequestException;
import com.jp.projects.posts.exception.NotFoundException;
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
    public PostCreateResponse createPost(PostCreateRequest request, DomainRef domain) {
        if ((request.postTypeId() == null) != (request.score() == null)) {
            throw new InvalidRequestException("postTypeId and score must be provided together");
        }
        Long domainId = domain.id();

        AppUser author = appUserRepository.findByDomainIdAndUsername(domainId, request.username())
                .orElseThrow(() -> new NotFoundException(
                        "AppUser with username '" + request.username() + "' not found"));

        Long effectiveResourceId;
        if (request.parentPostId() != null) {
            Post parent = getActive(request.parentPostId(), domainId);
            effectiveResourceId = parent.getResourceId();
        } else {
            resourceRepository.findByIdAndDomainIdAndDeletedAtIsNull(request.resourceId(), domainId)
                    .orElseThrow(() -> NotFoundException.of("Resource", request.resourceId()));
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

        // Map before flagging, not after: addOrUpdateFlag's upsert is a
        // @Modifying query with clearAutomatically = true, which detaches
        // `post` from the persistence context.
        PostResponse postResponse = postMapper.toResponse(post);

        PostFlagResponse flag = null;
        if (request.postTypeId() != null) {
            flag = postFlagService.addOrUpdateFlag(post.getId(),
                    new PostFlagCreateRequest(author.getId(), request.postTypeId(), request.score()), domain);
        }

        return new PostCreateResponse(postResponse, flag);
    }

    @Transactional
    public PostResponse createTopLevelPost(Long resourceId, TopLevelPostCreateRequest request, DomainRef domain) {
        Long domainId = domain.id();
        resourceRepository.findByIdAndDomainIdAndDeletedAtIsNull(resourceId, domainId)
                .orElseThrow(() -> NotFoundException.of("Resource", resourceId));
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
    public PostResponse createReply(Long parentPostId, ReplyCreateRequest request, DomainRef domain) {
        Long domainId = domain.id();
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

    public PostResponse get(Long postId, DomainRef domain) {
        return postMapper.toResponse(getActive(postId, domain.id()));
    }

    public Page<PostResponse> listTopLevel(Long resourceId, DomainRef domain, Pageable pageable) {
        Long domainId = domain.id();
        resourceRepository.findByIdAndDomainIdAndDeletedAtIsNull(resourceId, domainId)
                .orElseThrow(() -> NotFoundException.of("Resource", resourceId));
        return toResponsePage(postRepository
                .findByDomainIdAndResourceIdAndParentPostIdIsNullAndDeletedAtIsNull(domainId, resourceId, pageable),
                domainId);
    }

    public Page<PostResponse> listReplies(Long parentPostId, DomainRef domain, Pageable pageable) {
        Long domainId = domain.id();
        getActive(parentPostId, domainId);
        return toResponsePage(postRepository
                .findByDomainIdAndParentPostIdAndDeletedAtIsNull(domainId, parentPostId, pageable), domainId);
    }

    /** All posts (top-level + replies) authored by a user — design-spec.md §3.4. */
    public Page<PostResponse> listByUser(Long userId, DomainRef domain, Pageable pageable) {
        Long domainId = domain.id();
        requireUserInDomain(userId, domainId);
        return toResponsePage(postRepository
                .findByDomainIdAndUserIdAndDeletedAtIsNull(domainId, userId, pageable), domainId);
    }

    /**
     * Turns a page of posts into a page of responses, batch-loading the
     * three things the list endpoints add on top of a plain post — its
     * flags, its active reply count, and its resource's title — in three
     * queries total rather than per row.
     *
     * <p>Single-post reads/writes deliberately leave all three unset: the
     * caller is already on that resource's page. (By-user is the case that
     * most needs the title, since those posts span many resources.)
     */
    private Page<PostResponse> toResponsePage(Page<Post> posts, Long domainId) {
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
        // Domain-scoped and soft-delete-filtered like every other resource
        // lookup in this service. The IDs come from already-domain-scoped
        // posts so this can't currently narrow the result — it keeps the
        // invariant local instead of relying on the caller to hold it.
        Map<Long, String> resourceDisplayNameById = resourceIds.isEmpty()
                ? Map.of()
                : resourceRepository.findByIdInAndDomainIdAndDeletedAtIsNull(resourceIds, domainId).stream()
                        .collect(Collectors.toMap(Resource::getId, Resource::getDisplayName));
        return posts.map(post -> postMapper.toResponse(post,
                flagsByPostId.getOrDefault(post.getId(), List.of()),
                replyCountByPostId.getOrDefault(post.getId(), 0L),
                resourceDisplayNameById.get(post.getResourceId())));
    }

    @Transactional
    public PostResponse updatePostText(Long postId, PostUpdateRequest request, DomainRef domain) {
        Post post = getActive(postId, domain.id());
        requireOwner(post, request.userId());
        // Silently overwrites body_text in place — no edit history, per the
        // confirmed decision (design-spec.md §6).
        post.setBodyText(request.bodyText());
        return postMapper.toResponse(post);
    }

    @Transactional
    public void deletePost(Long postId, Long actingUserId, DomainRef domain) {
        Post post = getActive(postId, domain.id());
        requireOwner(post, actingUserId);
        // Ownership check and cascade run in the same transaction as the
        // @Modifying query requires an existing one, and a failed cascade
        // shouldn't leave the root post's delete standing on its own.
        postRepository.softDeleteSubtree(postId);
    }

    private Post getActive(Long postId, Long domainId) {
        return postRepository.findByIdAndDomainIdAndDeletedAtIsNull(postId, domainId)
                .orElseThrow(() -> NotFoundException.of("Post", postId));
    }

    /**
     * Explicit cross-domain author check for the endpoints that take a raw
     * {@code userId} rather than resolving one by username within this
     * domain already (design-spec.md §4.3) — the unified
     * {@code createPost} entry point gets this for free from its
     * domain-scoped username lookup instead. Returns the resolved
     * {@link AppUser} so callers building a new {@code Post} can set its
     * {@code user} association (needed for {@code PostMapper} to include
     * {@code username} in the response — a freshly built entity has no
     * lazy proxy to fall back on).
     */
    private AppUser requireUserInDomain(Long userId, Long domainId) {
        return appUserRepository.findByIdAndDomainId(userId, domainId)
                .orElseThrow(() -> NotFoundException.of("AppUser", userId));
    }

    private void requireOwner(Post post, Long actingUserId) {
        if (!post.getUserId().equals(actingUserId)) {
            throw new ForbiddenOperationException(
                    "User " + actingUserId + " does not own post " + post.getId());
        }
    }
}

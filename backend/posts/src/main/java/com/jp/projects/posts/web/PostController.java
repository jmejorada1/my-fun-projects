package com.jp.projects.posts.web;

import com.jp.projects.posts.dto.post.PostCreateRequest;
import com.jp.projects.posts.dto.post.PostCreateResponse;
import com.jp.projects.posts.dto.post.PostResponse;
import com.jp.projects.posts.dto.post.PostUpdateRequest;
import com.jp.projects.posts.dto.post.ReplyCreateRequest;
import com.jp.projects.posts.dto.post.TopLevelPostCreateRequest;
import com.jp.projects.posts.service.PostService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class PostController {

    private final PostService postService;

    /**
     * Unified creation endpoint: identifies the author by username, takes
     * resourceId + an optional parentPostId (present = reply, the server
     * derives the effective resourceId from the parent), and an optional
     * postTypeId/score pair to flag the post in the same call.
     */
    @PostMapping("/posts")
    @ResponseStatus(HttpStatus.CREATED)
    public PostCreateResponse createPost(@Valid @RequestBody PostCreateRequest request,
                                          @RequestHeader("X-Domain") String domain) {
        return postService.createPost(request, domain);
    }

    @PostMapping("/resources/{resourceId}/posts")
    @ResponseStatus(HttpStatus.CREATED)
    public PostResponse createTopLevelPost(@PathVariable Long resourceId,
                                            @Valid @RequestBody TopLevelPostCreateRequest request,
                                            @RequestHeader("X-Domain") String domain) {
        return postService.createTopLevelPost(resourceId, request, domain);
    }

    @GetMapping("/resources/{resourceId}/posts")
    public Page<PostResponse> listTopLevelPosts(@PathVariable Long resourceId, Pageable pageable,
                                                 @RequestHeader("X-Domain") String domain) {
        return postService.listTopLevel(resourceId, domain, pageable);
    }

    @PostMapping("/posts/{postId}/replies")
    @ResponseStatus(HttpStatus.CREATED)
    public PostResponse createReply(@PathVariable Long postId,
                                     @Valid @RequestBody ReplyCreateRequest request,
                                     @RequestHeader("X-Domain") String domain) {
        return postService.createReply(postId, request, domain);
    }

    @GetMapping("/posts/{postId}/replies")
    public Page<PostResponse> listReplies(@PathVariable Long postId, Pageable pageable,
                                           @RequestHeader("X-Domain") String domain) {
        return postService.listReplies(postId, domain, pageable);
    }

    @GetMapping("/posts/{postId}")
    public PostResponse get(@PathVariable Long postId, @RequestHeader("X-Domain") String domain) {
        return postService.get(postId, domain);
    }

    /** All posts (top-level + replies) authored by a user — design-spec.md §3.4. */
    @GetMapping("/users/{userId}/posts")
    public Page<PostResponse> listByUser(@PathVariable Long userId,
                                          @PageableDefault(sort = "createdAt", direction = Sort.Direction.DESC)
                                          Pageable pageable,
                                          @RequestHeader("X-Domain") String domain) {
        return postService.listByUser(userId, domain, pageable);
    }

    @PatchMapping("/posts/{postId}")
    public PostResponse update(@PathVariable Long postId, @Valid @RequestBody PostUpdateRequest request,
                                @RequestHeader("X-Domain") String domain) {
        return postService.updatePostText(postId, request, domain);
    }

    @DeleteMapping("/posts/{postId}")
    public ResponseEntity<Void> delete(@PathVariable Long postId, @RequestHeader("X-User-Id") Long actingUserId,
                                        @RequestHeader("X-Domain") String domain) {
        postService.deletePost(postId, actingUserId, domain);
        return ResponseEntity.noContent().build();
    }
}

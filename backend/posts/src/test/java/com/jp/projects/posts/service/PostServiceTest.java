package com.jp.projects.posts.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.jp.projects.posts.dto.post.PostCreateRequest;
import com.jp.projects.posts.dto.post.PostCreateResponse;
import com.jp.projects.posts.dto.post.PostResponse;
import com.jp.projects.posts.dto.post.PostUpdateRequest;
import com.jp.projects.posts.dto.post.ReplyCreateRequest;
import com.jp.projects.posts.entity.AppUser;
import com.jp.projects.posts.entity.Post;
import com.jp.projects.posts.entity.Resource;
import com.jp.projects.posts.exception.ForbiddenOperationException;
import com.jp.projects.posts.exception.InvalidRequestException;
import com.jp.projects.posts.exception.NotFoundException;
import com.jp.projects.posts.mapper.PostMapper;
import com.jp.projects.posts.repository.AppUserRepository;
import com.jp.projects.posts.repository.PostRepository;
import com.jp.projects.posts.repository.ResourceRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PostServiceTest {

    private static final Long DOMAIN_ID = 1L;
    // The resolved X-Domain header, supplied by CurrentDomainArgumentResolver
    // in production. Services no longer look it up themselves, so there is
    // nothing left to stub per test.
    private static final DomainRef DOMAIN = new DomainRef(DOMAIN_ID, "imdb");

    @Mock
    private PostRepository postRepository;
    @Mock
    private ResourceRepository resourceRepository;
    @Mock
    private AppUserRepository appUserRepository;
    @Mock
    private PostFlagService postFlagService;
    @Mock
    private PostMapper postMapper;

    @InjectMocks
    private PostService postService;

    @Test
    void createReply_derivesResourceIdFromParent_ratherThanClient() {
        Post parent = Post.builder().id(1L).domainId(DOMAIN_ID).resourceId(42L).userId(1L).bodyText("root").build();
        when(postRepository.findByIdAndDomainIdAndDeletedAtIsNull(1L, DOMAIN_ID)).thenReturn(Optional.of(parent));
        when(appUserRepository.findByIdAndDomainId(2L, DOMAIN_ID))
                .thenReturn(Optional.of(AppUser.builder().id(2L).domainId(DOMAIN_ID).build()));
        when(postRepository.save(any(Post.class))).thenAnswer(inv -> inv.getArgument(0));
        when(postMapper.toResponse(any(Post.class))).thenAnswer(inv -> {
            Post p = inv.getArgument(0);
            return new PostResponse(p.getId(), p.getResourceId(), p.getUserId(), p.getUser() != null ? p.getUser().getUsername() : null, p.getParentPostId(),
                    p.getBodyText(), p.getData(), null, null, List.of(), 0L, null);
        });

        ReplyCreateRequest request = new ReplyCreateRequest(2L, "a reply", null);
        PostResponse response = postService.createReply(1L, request, DOMAIN);

        assertThat(response.resourceId()).isEqualTo(42L);
        assertThat(response.parentPostId()).isEqualTo(1L);
        verify(postRepository).save(any(Post.class));
    }

    @Test
    void createReply_missingParent_throwsNotFound() {
        when(postRepository.findByIdAndDomainIdAndDeletedAtIsNull(99L, DOMAIN_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> postService.createReply(99L, new ReplyCreateRequest(1L, "x", null), DOMAIN))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void updatePostText_wrongUser_throwsForbidden() {
        Post post = Post.builder().id(1L).domainId(DOMAIN_ID).resourceId(1L).userId(1L).bodyText("original").build();
        when(postRepository.findByIdAndDomainIdAndDeletedAtIsNull(1L, DOMAIN_ID)).thenReturn(Optional.of(post));

        PostUpdateRequest request = new PostUpdateRequest(999L, "hacked");

        assertThatThrownBy(() -> postService.updatePostText(1L, request, DOMAIN))
                .isInstanceOf(ForbiddenOperationException.class);
    }

    @Test
    void deletePost_ownerVerified_cascadesToSubtree() {
        Post post = Post.builder().id(1L).domainId(DOMAIN_ID).resourceId(1L).userId(1L).bodyText("root").build();
        when(postRepository.findByIdAndDomainIdAndDeletedAtIsNull(1L, DOMAIN_ID)).thenReturn(Optional.of(post));

        postService.deletePost(1L, 1L, DOMAIN);

        verify(postRepository).softDeleteSubtree(eq(1L));
    }

    @Test
    void createPost_topLevel_resolvesAuthorByUsername() {
        AppUser author = AppUser.builder().id(7L).domainId(DOMAIN_ID).username("jdoe").build();
        when(appUserRepository.findByDomainIdAndUsername(DOMAIN_ID, "jdoe")).thenReturn(Optional.of(author));
        when(resourceRepository.findByIdAndDomainIdAndDeletedAtIsNull(5L, DOMAIN_ID))
                .thenReturn(Optional.of(Resource.builder().id(5L).domainId(DOMAIN_ID).build()));
        when(postRepository.save(any(Post.class))).thenAnswer(inv -> inv.getArgument(0));
        when(postMapper.toResponse(any(Post.class))).thenAnswer(inv -> {
            Post p = inv.getArgument(0);
            return new PostResponse(p.getId(), p.getResourceId(), p.getUserId(), p.getUser() != null ? p.getUser().getUsername() : null, p.getParentPostId(),
                    p.getBodyText(), p.getData(), null, null, List.of(), 0L, null);
        });

        PostCreateRequest request = new PostCreateRequest("jdoe", 5L, null, "hello", null, null, null);
        PostCreateResponse response = postService.createPost(request, DOMAIN);

        assertThat(response.post().userId()).isEqualTo(7L);
        assertThat(response.post().username()).isEqualTo("jdoe");
        assertThat(response.post().resourceId()).isEqualTo(5L);
        assertThat(response.flag()).isNull();
    }

    @Test
    void createPost_withParent_derivesResourceIdAndIgnoresClientValue() {
        AppUser author = AppUser.builder().id(7L).domainId(DOMAIN_ID).username("jdoe").build();
        when(appUserRepository.findByDomainIdAndUsername(DOMAIN_ID, "jdoe")).thenReturn(Optional.of(author));
        Post parent = Post.builder().id(3L).domainId(DOMAIN_ID).resourceId(42L).userId(1L).bodyText("root").build();
        when(postRepository.findByIdAndDomainIdAndDeletedAtIsNull(3L, DOMAIN_ID)).thenReturn(Optional.of(parent));
        when(postRepository.save(any(Post.class))).thenAnswer(inv -> inv.getArgument(0));
        when(postMapper.toResponse(any(Post.class))).thenAnswer(inv -> {
            Post p = inv.getArgument(0);
            return new PostResponse(p.getId(), p.getResourceId(), p.getUserId(), p.getUser() != null ? p.getUser().getUsername() : null, p.getParentPostId(),
                    p.getBodyText(), p.getData(), null, null, List.of(), 0L, null);
        });

        // resourceId=999 deliberately wrong/stale — should be ignored in favor of the parent's
        PostCreateRequest request = new PostCreateRequest("jdoe", 999L, 3L, "a reply", null, null, null);
        PostCreateResponse response = postService.createPost(request, DOMAIN);

        assertThat(response.post().resourceId()).isEqualTo(42L);
        assertThat(response.post().parentPostId()).isEqualTo(3L);
    }

    @Test
    void createPost_postTypeWithoutScore_throwsInvalidRequest() {
        PostCreateRequest request = new PostCreateRequest("jdoe", 5L, null, "hello", 1L, null, null);

        assertThatThrownBy(() -> postService.createPost(request, DOMAIN))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void createPost_unknownUsername_throwsNotFound() {
        when(appUserRepository.findByDomainIdAndUsername(DOMAIN_ID, "ghost")).thenReturn(Optional.empty());

        PostCreateRequest request = new PostCreateRequest("ghost", 5L, null, "hello", null, null, null);

        assertThatThrownBy(() -> postService.createPost(request, DOMAIN))
                .isInstanceOf(NotFoundException.class);
    }
}

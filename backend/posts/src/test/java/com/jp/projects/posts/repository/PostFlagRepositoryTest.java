package com.jp.projects.posts.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.jp.projects.posts.config.JpaAuditingConfig;
import com.jp.projects.posts.entity.AppUser;
import com.jp.projects.posts.entity.Domain;
import com.jp.projects.posts.entity.Post;
import com.jp.projects.posts.entity.PostFlag;
import com.jp.projects.posts.entity.Resource;
import com.jp.projects.posts.entity.ResourceCategory;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditingConfig.class)
@Testcontainers
class PostFlagRepositoryTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void schemaProperties(DynamicPropertyRegistry registry) {
        // @ServiceConnection generates its own JDBC URL without the app's
        // usual schema settings; point Hikari at the same "posts" schema
        // Flyway creates so unqualified native queries resolve correctly.
        registry.add("spring.datasource.hikari.schema", () -> "posts");
    }

    @Autowired
    private DomainRepository domainRepository;
    @Autowired
    private ResourceCategoryRepository resourceCategoryRepository;
    @Autowired
    private ResourceRepository resourceRepository;
    @Autowired
    private AppUserRepository appUserRepository;
    @Autowired
    private PostRepository postRepository;
    @Autowired
    private PostTypeRepository postTypeRepository;
    @Autowired
    private PostFlagRepository postFlagRepository;

    private Long postId;
    private Long postTypeId;

    private Long domainId;

    @BeforeEach
    void setUp() {
        Domain domain = domainRepository.findByName("imdb").orElseThrow();
        domainId = domain.getId();
        ResourceCategory category = resourceCategoryRepository.findByDomainIdAndName(domainId, "movie")
                .orElseThrow();
        // Native @Modifying queries bypass the Hibernate session and hit
        // JDBC directly, so setup rows must be physically flushed first or
        // the FK-constrained upsert below won't see them yet.
        Resource resource = resourceRepository.saveAndFlush(Resource.builder()
                .domainId(domainId)
                .name("tt-" + System.nanoTime())
                .displayName("A Movie")
                .categoryId(category.getId())
                .build());
        AppUser user = appUserRepository.saveAndFlush(AppUser.builder()
                .domainId(domainId)
                .username("user-" + System.nanoTime())
                .email(System.nanoTime() + "@example.com")
                .build());
        Post post = postRepository.saveAndFlush(Post.builder()
                .domainId(domainId)
                .resourceId(resource.getId())
                .userId(user.getId())
                .bodyText("body")
                .build());
        postId = post.getId();
        postTypeId = postTypeRepository.findByDomainIdAndName(domainId, "racism").orElseThrow().getId();
    }

    @Test
    void upsertActiveFlag_secondCallUpdatesInPlace_doesNotDuplicate() {
        postFlagRepository.upsertActiveFlag(postId, postTypeId, (short) 2, domainId);
        postFlagRepository.upsertActiveFlag(postId, postTypeId, (short) 5, domainId);

        List<PostFlag> active = postFlagRepository.findByPostIdAndDeletedAtIsNull(postId);

        assertThat(active).hasSize(1);
        assertThat(active.get(0).getScore()).isEqualTo((short) 5);
    }

    @Test
    void softDeletedFlag_canBeReAdded_withoutViolatingPartialUniqueIndex() {
        postFlagRepository.upsertActiveFlag(postId, postTypeId, (short) 3, domainId);
        Optional<PostFlag> flag =
                postFlagRepository.findByPostIdAndPostTypeIdAndDeletedAtIsNull(postId, postTypeId);
        assertThat(flag).isPresent();

        flag.get().setDeletedAt(Instant.now());
        postFlagRepository.saveAndFlush(flag.get());

        // The partial unique index only covers deleted_at IS NULL rows, so a
        // fresh upsert after a soft delete must succeed rather than conflict.
        postFlagRepository.upsertActiveFlag(postId, postTypeId, (short) 4, domainId);

        List<PostFlag> active = postFlagRepository.findByPostIdAndDeletedAtIsNull(postId);
        assertThat(active).hasSize(1);
        assertThat(active.get(0).getScore()).isEqualTo((short) 4);
    }
}

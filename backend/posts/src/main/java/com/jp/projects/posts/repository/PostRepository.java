package com.jp.projects.posts.repository;

import com.jp.projects.posts.entity.Post;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PostRepository extends JpaRepository<Post, Long> {

    Optional<Post> findByIdAndDomainIdAndDeletedAtIsNull(Long id, Long domainId);

    Page<Post> findByDomainIdAndResourceIdAndParentPostIdIsNullAndDeletedAtIsNull(
            Long domainId, Long resourceId, Pageable pageable);

    Page<Post> findByDomainIdAndParentPostIdAndDeletedAtIsNull(Long domainId, Long parentPostId, Pageable pageable);

    /** All posts (top-level + replies) authored by a user — design-spec.md §3.4. */
    Page<Post> findByDomainIdAndUserIdAndDeletedAtIsNull(Long domainId, Long userId, Pageable pageable);

    /**
     * Batch variant for a page of posts (list endpoints): how many active
     * replies each has, in one grouped query rather than one COUNT per
     * post. Parents with zero replies are simply absent from the result —
     * PostService treats a missing entry as 0.
     */
    @Query("SELECT p.parentPostId AS parentPostId, COUNT(p) AS replyCount FROM Post p "
            + "WHERE p.parentPostId IN :parentPostIds AND p.deletedAt IS NULL GROUP BY p.parentPostId")
    List<ReplyCount> countActiveRepliesByParentPostIdIn(@Param("parentPostIds") Collection<Long> parentPostIds);

    interface ReplyCount {
        Long getParentPostId();

        Long getReplyCount();
    }

    /**
     * Batch variant for a page of search results: how many posts (top-level
     * + replies) each resource has, in one grouped query. A resource with
     * zero posts is simply absent — ResourceService treats a missing entry
     * as 0.
     */
    @Query("SELECT p.resourceId AS resourceId, COUNT(p) AS postCount FROM Post p "
            + "WHERE p.resourceId IN :resourceIds AND p.deletedAt IS NULL GROUP BY p.resourceId")
    List<ResourcePostCount> countByResourceIdIn(@Param("resourceIds") Collection<Long> resourceIds);

    interface ResourcePostCount {
        Long getResourceId();

        Long getPostCount();
    }

    /**
     * Write-time recursive cascade (design-spec.md §6, resolved). Must always
     * be called from within an existing {@code @Transactional} service
     * method — {@code @Modifying} queries require one, and this shouldn't
     * commit independently of the caller's ownership check.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
        WITH RECURSIVE subtree AS (
            SELECT id FROM post WHERE id = :postId
            UNION ALL
            SELECT p.id FROM post p JOIN subtree s ON p.parent_post_id = s.id
        )
        UPDATE post SET deleted_at = now()
        WHERE id IN (SELECT id FROM subtree) AND deleted_at IS NULL
        """, nativeQuery = true)
    void softDeleteSubtree(@Param("postId") Long postId);
}

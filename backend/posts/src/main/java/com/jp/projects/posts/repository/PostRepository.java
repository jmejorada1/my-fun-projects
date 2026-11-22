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

    Page<Post> findByDomainIdAndUserIdAndDeletedAtIsNull(Long domainId, Long userId, Pageable pageable);

    /** Posts with no replies are absent from the result. */
    @Query("SELECT p.parentPostId AS parentPostId, COUNT(p) AS replyCount FROM Post p "
            + "WHERE p.parentPostId IN :parentPostIds AND p.deletedAt IS NULL GROUP BY p.parentPostId")
    List<ReplyCount> countActiveRepliesByParentPostIdIn(@Param("parentPostIds") Collection<Long> parentPostIds);

    interface ReplyCount {
        Long getParentPostId();

        Long getReplyCount();
    }

    /** Counts replies too. Resources with no posts are absent from the result. */
    @Query("SELECT p.resourceId AS resourceId, COUNT(p) AS postCount FROM Post p "
            + "WHERE p.resourceId IN :resourceIds AND p.deletedAt IS NULL GROUP BY p.resourceId")
    List<ResourcePostCount> countByResourceIdIn(@Param("resourceIds") Collection<Long> resourceIds);

    interface ResourcePostCount {
        Long getResourceId();

        Long getPostCount();
    }

    /** Recursive cascade (design-spec.md decision #10). Call inside the caller's transaction. */
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

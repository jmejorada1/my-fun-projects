package com.jp.projects.posts.repository;

import com.jp.projects.posts.entity.PostFlag;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PostFlagRepository extends JpaRepository<PostFlag, Long> {

    List<PostFlag> findByPostIdAndDeletedAtIsNull(Long postId);

    /**
     * Batch variant for a page of posts (post-list endpoints) — join-fetches
     * postType so mapping to PostFlagResponse doesn't trigger a lazy load
     * per flag.
     */
    @Query("SELECT pf FROM PostFlag pf JOIN FETCH pf.postType WHERE pf.postId IN :postIds AND pf.deletedAt IS NULL")
    List<PostFlag> findByPostIdInAndDeletedAtIsNull(@Param("postIds") Collection<Long> postIds);

    Optional<PostFlag> findByPostIdAndPostTypeIdAndDeletedAtIsNull(Long postId, Long postTypeId);

    /**
     * Atomic upsert-by-type against the partial unique index on
     * (post_id, post_type_id) WHERE deleted_at IS NULL — see
     * PostFlagService.addOrUpdateFlag. domain_id is only ever written on
     * insert; ON CONFLICT never changes it, since post_id doesn't change
     * across the upsert.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
        INSERT INTO post_flag (post_id, post_type_id, score, domain_id)
        VALUES (:postId, :postTypeId, :score, :domainId)
        ON CONFLICT (post_id, post_type_id)
        WHERE deleted_at IS NULL
        DO UPDATE SET score = EXCLUDED.score, updated_at = now()
        """, nativeQuery = true)
    void upsertActiveFlag(@Param("postId") Long postId,
                           @Param("postTypeId") Long postTypeId,
                           @Param("score") Short score,
                           @Param("domainId") Long domainId);

    /**
     * Batch variant for a page of search results: each resource's active
     * flags grouped by category, with an average score and count per
     * category — backs the search results' flag-summary columns. No
     * ranking/window function needed here (unlike
     * findTopRankedResourcesByPostType), so plain JPQL suffices.
     */
    @Query("""
        SELECT pf.post.resourceId AS resourceId, pf.postType.name AS postTypeName,
               AVG(pf.score) AS avgScore, COUNT(pf) AS flagCount
        FROM PostFlag pf
        WHERE pf.deletedAt IS NULL AND pf.post.deletedAt IS NULL AND pf.post.resourceId IN :resourceIds
        GROUP BY pf.post.resourceId, pf.postType.name
        """)
    List<ResourceFlagSummaryRow> findFlagSummaryByResourceIdIn(@Param("resourceIds") Collection<Long> resourceIds);

    interface ResourceFlagSummaryRow {
        Long getResourceId();

        String getPostTypeName();

        Double getAvgScore();

        Long getFlagCount();
    }

    /**
     * Backs {@code GET /rankings} (design-spec.md §3.5): for each
     * {@code post_type} in the domain, the 5 resources with the highest
     * average score among their active flags of that type. Flags on a
     * soft-deleted post, and soft-deleted resources, are excluded —
     * consistent with the rest of the API's {@code deletedAt} filtering.
     * Ranks with a window function (unavailable in JPQL), hence native SQL;
     * results are grouped by post type in {@code RankingService}, which
     * also fills in post types with zero flags (absent here entirely).
     *
     * <p>Backed by {@code idx_post_flag_rankings}
     * ({@code V18__add_search_and_ranking_indexes.sql}).
     */
    @Query(value = """
        WITH scored AS (
            SELECT
                pf.post_type_id,
                p.resource_id,
                AVG(pf.score) AS avg_score,
                COUNT(*) AS flag_count
            FROM post_flag pf
            JOIN post p ON p.id = pf.post_id AND p.deleted_at IS NULL
            WHERE pf.domain_id = :domainId AND pf.deleted_at IS NULL
            GROUP BY pf.post_type_id, p.resource_id
        ),
        ranked AS (
            SELECT
                scored.*,
                ROW_NUMBER() OVER (
                    PARTITION BY post_type_id ORDER BY avg_score DESC, flag_count DESC
                ) AS rn
            FROM scored
        )
        SELECT
            ranked.post_type_id AS postTypeId,
            pt.name AS postTypeName,
            ranked.resource_id AS resourceId,
            r.name AS resourceName,
            r.display_name AS resourceDisplayName,
            ranked.avg_score AS avgScore,
            ranked.flag_count AS flagCount
        FROM ranked
        JOIN post_type pt ON pt.id = ranked.post_type_id
        JOIN resource r ON r.id = ranked.resource_id AND r.deleted_at IS NULL
        WHERE ranked.rn <= 5
        ORDER BY ranked.post_type_id, ranked.rn
        """, nativeQuery = true)
    List<PostTypeRankingRow> findTopRankedResourcesByPostType(@Param("domainId") Long domainId);
}

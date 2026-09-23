package com.jp.projects.posts.repository;

import com.jp.projects.posts.entity.Resource;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ResourceRepository extends JpaRepository<Resource, Long> {

    Optional<Resource> findByIdAndDomainIdAndDeletedAtIsNull(Long id, Long domainId);

    /**
     * Batch variant for the resource titles a page of posts refers to.
     * Domain-scoped and soft-delete-filtered like every other read here,
     * rather than a bare {@code findAllById}.
     */
    List<Resource> findByIdInAndDomainIdAndDeletedAtIsNull(Collection<Long> ids, Long domainId);

    /**
     * Backs {@code GET /resources}: both filters are optional and
     * combinable (frontend/imdb-ui-angular/docs/design-spec.md §3.3).
     *
     * <p>Escapes LIKE metacharacters in {@code search} before delegating,
     * so a literal {@code %} or {@code _} in someone's search text is
     * matched literally instead of acting as an unintended wildcard (e.g.
     * searching for "50%" matching any title containing "50" followed by
     * anything). This used to live in {@code ResourceService}, with only
     * prose linking it to the {@code ESCAPE} clause in the query below —
     * nothing stopped a new caller from skipping it. Keeping both halves
     * in one file makes that impossible.
     */
    default Page<Resource> searchByDisplayName(Long domainId, Long categoryId, String search, Pageable pageable) {
        return search(domainId, categoryId, escapeLikePattern(search), pageable);
    }

    /**
     * {@code categoryId}/{@code search} are matched with
     * {@code = :param OR :param IS NULL} rather than four derived-query
     * variants for every present/absent combination. {@code search} is
     * always a bind parameter (never concatenated — not SQL-injectable
     * either way) and arrives pre-escaped from
     * {@link #searchByDisplayName}; {@code ESCAPE '\'} tells Postgres
     * which escape character to honor in the pattern.
     *
     * <p>The leading wildcard makes a B-tree index unusable, so
     * {@code V18__add_search_and_ranking_indexes.sql} adds a pg_trgm GIN
     * index on {@code lower(display_name)} to back this — {@code resource}
     * is loaded from the full IMDB title dump, and without it every search
     * is a sequential scan.
     *
     * <p>{@code :search} is cast explicitly because it is nullable and
     * feeds {@code LOWER}/{@code CONCAT}: a null bound without a type
     * reaches Postgres as {@code unknown}, which it resolves to
     * {@code bytea}, and the statement fails to parse with
     * {@code function lower(bytea) does not exist} — a 500 on every
     * {@code GET /resources} call that omits {@code search} (a request
     * sending {@code search=} happens to bind an empty string instead and
     * was unaffected). {@code :categoryId} needs no cast: it is only ever
     * compared to a {@code bigint} column, which gives Postgres the type.
     */
    @Query("""
        SELECT r FROM Resource r
        WHERE r.domainId = :domainId
          AND r.deletedAt IS NULL
          AND (:categoryId IS NULL OR r.categoryId = :categoryId)
          AND (CAST(:search AS String) IS NULL
               OR LOWER(r.displayName) LIKE LOWER(CONCAT('%', CAST(:search AS String), '%')) ESCAPE '\\')
        """)
    Page<Resource> search(@Param("domainId") Long domainId,
                           @Param("categoryId") Long categoryId,
                           @Param("search") String search,
                           Pageable pageable);

    private static String escapeLikePattern(String search) {
        if (search == null) {
            return null;
        }
        return search
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }
}

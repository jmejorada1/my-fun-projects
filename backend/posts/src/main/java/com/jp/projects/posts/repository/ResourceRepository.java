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

    List<Resource> findByIdInAndDomainIdAndDeletedAtIsNull(Collection<Long> ids, Long domainId);

    /** Escapes LIKE wildcards so {@code %} and {@code _} in the search text match literally. */
    default Page<Resource> searchByDisplayName(Long domainId, Long categoryId, String search, Pageable pageable) {
        return search(domainId, categoryId, escapeLikePattern(search), pageable);
    }

    /**
     * Call {@link #searchByDisplayName}, which escapes {@code search}. Both filters are optional.
     * A pg_trgm index (V18) backs the leading-wildcard LIKE. {@code :search} is cast because an
     * untyped null reaches Postgres as bytea and {@code lower(bytea)} fails.
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

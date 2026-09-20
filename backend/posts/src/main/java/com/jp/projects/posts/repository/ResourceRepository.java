package com.jp.projects.posts.repository;

import com.jp.projects.posts.entity.Resource;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ResourceRepository extends JpaRepository<Resource, Long> {

    Optional<Resource> findByIdAndDomainIdAndDeletedAtIsNull(Long id, Long domainId);

    /**
     * Backs {@code GET /resources}: both filters are optional and
     * combinable (frontend/imdb-ui-angular/docs/design-spec.md §3.3).
     * {@code categoryId}/{@code search} are matched with
     * {@code = :param OR :param IS NULL} rather than four derived-query
     * variants for every present/absent combination.
     */
    @Query("""
        SELECT r FROM Resource r
        WHERE r.domainId = :domainId
          AND r.deletedAt IS NULL
          AND (:categoryId IS NULL OR r.categoryId = :categoryId)
          AND (:search IS NULL OR LOWER(r.displayName) LIKE LOWER(CONCAT('%', :search, '%')))
        """)
    Page<Resource> search(@Param("domainId") Long domainId,
                           @Param("categoryId") Long categoryId,
                           @Param("search") String search,
                           Pageable pageable);
}

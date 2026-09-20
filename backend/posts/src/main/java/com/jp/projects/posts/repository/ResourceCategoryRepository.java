package com.jp.projects.posts.repository;

import com.jp.projects.posts.entity.ResourceCategory;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ResourceCategoryRepository extends JpaRepository<ResourceCategory, Long> {

    Optional<ResourceCategory> findByDomainIdAndName(Long domainId, String name);

    Optional<ResourceCategory> findByIdAndDomainId(Long id, Long domainId);

    List<ResourceCategory> findAllByDomainId(Long domainId);
}

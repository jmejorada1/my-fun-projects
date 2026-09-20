package com.jp.projects.posts.repository;

import com.jp.projects.posts.entity.PostType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PostTypeRepository extends JpaRepository<PostType, Long> {

    Optional<PostType> findByDomainIdAndName(Long domainId, String name);

    Optional<PostType> findByIdAndDomainId(Long id, Long domainId);

    List<PostType> findAllByDomainId(Long domainId);
}

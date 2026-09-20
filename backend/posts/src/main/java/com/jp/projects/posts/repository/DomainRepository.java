package com.jp.projects.posts.repository;

import com.jp.projects.posts.entity.Domain;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DomainRepository extends JpaRepository<Domain, Long> {

    Optional<Domain> findByName(String name);
}

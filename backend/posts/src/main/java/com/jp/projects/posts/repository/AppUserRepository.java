package com.jp.projects.posts.repository;

import com.jp.projects.posts.entity.AppUser;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByDomainIdAndUsername(Long domainId, String username);

    Optional<AppUser> findByIdAndDomainId(Long id, Long domainId);

    List<AppUser> findAllByDomainId(Long domainId);
}

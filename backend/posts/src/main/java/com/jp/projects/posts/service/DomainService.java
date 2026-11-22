package com.jp.projects.posts.service;

import com.jp.projects.posts.config.CacheConfig;
import com.jp.projects.posts.dto.domain.DomainResponse;
import com.jp.projects.posts.exception.NotFoundException;
import com.jp.projects.posts.mapper.DomainMapper;
import com.jp.projects.posts.repository.DomainRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class DomainService {

    private final DomainRepository domainRepository;
    private final DomainMapper domainMapper;

    public List<DomainResponse> listAll() {
        return domainRepository.findAll().stream()
                .map(domainMapper::toResponse)
                .toList();
    }

    public DomainResponse get(Long id) {
        return domainMapper.toResponse(domainRepository.findById(id)
                .orElseThrow(() -> NotFoundException.of("Domain", id)));
    }

    /** Cached (see CacheConfig). */
    @Cacheable(CacheConfig.DOMAINS_BY_NAME)
    public DomainRef requireByName(String name) {
        return domainRepository.findByName(name)
                .map(domain -> new DomainRef(domain.getId(), domain.getName()))
                .orElseThrow(() -> new NotFoundException("Domain '" + name + "' not found"));
    }
}

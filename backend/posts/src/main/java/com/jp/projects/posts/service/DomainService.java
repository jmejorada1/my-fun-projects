package com.jp.projects.posts.service;

import com.jp.projects.posts.dto.domain.DomainResponse;
import com.jp.projects.posts.entity.Domain;
import com.jp.projects.posts.exception.EntityNotFoundException;
import com.jp.projects.posts.mapper.DomainMapper;
import com.jp.projects.posts.repository.DomainRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
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
                .orElseThrow(() -> EntityNotFoundException.of("Domain", id)));
    }

    /**
     * Resolves the {@code X-Domain} header value every domain-scoped
     * endpoint requires (architecture.md §8.1). Callers only ever
     * need {@code getId()} off the result.
     */
    public Domain requireByName(String name) {
        return domainRepository.findByName(name)
                .orElseThrow(() -> new EntityNotFoundException("Domain '" + name + "' not found"));
    }
}

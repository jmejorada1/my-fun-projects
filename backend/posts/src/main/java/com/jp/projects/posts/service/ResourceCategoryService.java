package com.jp.projects.posts.service;

import com.jp.projects.posts.dto.category.ResourceCategoryResponse;
import com.jp.projects.posts.entity.ResourceCategory;
import com.jp.projects.posts.exception.NotFoundException;
import com.jp.projects.posts.mapper.ResourceCategoryMapper;
import com.jp.projects.posts.repository.ResourceCategoryRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ResourceCategoryService {

    private final ResourceCategoryRepository resourceCategoryRepository;
    private final ResourceCategoryMapper resourceCategoryMapper;

    public List<ResourceCategoryResponse> listAll(DomainRef domain) {
        return resourceCategoryRepository.findAllByDomainId(domain.id()).stream()
                .map(resourceCategoryMapper::toResponse)
                .toList();
    }

    public ResourceCategoryResponse get(Long id, DomainRef domain) {
        ResourceCategory category = resourceCategoryRepository.findByIdAndDomainId(id, domain.id())
                .orElseThrow(() -> NotFoundException.of("ResourceCategory", id));
        return resourceCategoryMapper.toResponse(category);
    }
}

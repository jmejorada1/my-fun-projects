package com.jp.projects.posts.service;

import com.jp.projects.posts.dto.category.ResourceCategoryResponse;
import com.jp.projects.posts.entity.ResourceCategory;
import com.jp.projects.posts.exception.EntityNotFoundException;
import com.jp.projects.posts.mapper.ResourceMapper;
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
    private final ResourceMapper resourceMapper;
    private final DomainService domainService;

    public List<ResourceCategoryResponse> listAll(String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        return resourceCategoryRepository.findAllByDomainId(domainId).stream()
                .map(resourceMapper::toResponse)
                .toList();
    }

    public ResourceCategoryResponse get(Long id, String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        ResourceCategory category = resourceCategoryRepository.findByIdAndDomainId(id, domainId)
                .orElseThrow(() -> EntityNotFoundException.of("ResourceCategory", id));
        return resourceMapper.toResponse(category);
    }
}

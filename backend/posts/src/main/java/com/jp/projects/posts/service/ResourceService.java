package com.jp.projects.posts.service;

import com.jp.projects.posts.dto.resource.ResourceCreateRequest;
import com.jp.projects.posts.dto.resource.ResourceFlagSummaryEntry;
import com.jp.projects.posts.dto.resource.ResourceResponse;
import com.jp.projects.posts.entity.Resource;
import com.jp.projects.posts.entity.ResourceCategory;
import com.jp.projects.posts.exception.EntityNotFoundException;
import com.jp.projects.posts.mapper.ResourceMapper;
import com.jp.projects.posts.repository.PostFlagRepository;
import com.jp.projects.posts.repository.PostRepository;
import com.jp.projects.posts.repository.ResourceCategoryRepository;
import com.jp.projects.posts.repository.ResourceRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ResourceService {

    private final ResourceRepository resourceRepository;
    private final ResourceCategoryRepository resourceCategoryRepository;
    private final PostRepository postRepository;
    private final PostFlagRepository postFlagRepository;
    private final ResourceMapper resourceMapper;
    private final DomainService domainService;

    @Transactional
    public ResourceResponse create(ResourceCreateRequest request, String domain) {
        Long domainId = domainService.requireByName(domain).getId();

        // Must be a real lookup (not getReferenceById) because it also
        // proves the category belongs to this domain — resource.domainId
        // is derived from it, not client-supplied (domain-scoping-spec.md
        // D11).
        ResourceCategory category = resourceCategoryRepository
                .findByIdAndDomainId(request.categoryId(), domainId)
                .orElseThrow(() -> EntityNotFoundException.of("ResourceCategory", request.categoryId()));

        // No pre-check on `name` uniqueness — that would be a race-prone
        // check-then-insert. The DB's unique constraint is the source of
        // truth; a violation surfaces as a 409 via GlobalExceptionHandler.
        Resource resource = Resource.builder()
                .domainId(domainId)
                .name(request.name())
                .displayName(request.displayName())
                .categoryId(request.categoryId())
                .category(category)
                .data(request.data())
                .build();
        return resourceMapper.toResponse(resourceRepository.save(resource));
    }

    public ResourceResponse get(Long id, String domain) {
        return resourceMapper.toResponse(getActive(id, domain));
    }

    public Page<ResourceResponse> list(Long categoryId, String search, String domain, Pageable pageable) {
        Long domainId = domainService.requireByName(domain).getId();
        Page<Resource> resources = resourceRepository.search(domainId, categoryId, search, pageable);

        List<Long> resourceIds = resources.getContent().stream().map(Resource::getId).toList();
        Map<Long, Long> postCountByResourceId = resourceIds.isEmpty()
                ? Map.of()
                : postRepository.countByResourceIdIn(resourceIds).stream()
                        .collect(Collectors.toMap(PostRepository.ResourcePostCount::getResourceId,
                                PostRepository.ResourcePostCount::getPostCount));
        Map<Long, List<ResourceFlagSummaryEntry>> flagSummaryByResourceId = resourceIds.isEmpty()
                ? Map.of()
                : postFlagRepository.findFlagSummaryByResourceIdIn(resourceIds).stream()
                        .collect(Collectors.groupingBy(PostFlagRepository.ResourceFlagSummaryRow::getResourceId,
                                Collectors.mapping(row -> new ResourceFlagSummaryEntry(
                                        row.getPostTypeName(), row.getAvgScore(), row.getFlagCount()),
                                        Collectors.toList())));

        return resources.map(resource -> resourceMapper.toResponse(resource,
                postCountByResourceId.getOrDefault(resource.getId(), 0L),
                flagSummaryByResourceId.getOrDefault(resource.getId(), List.of())));
    }

    @Transactional
    public void softDelete(Long id, String domain) {
        Resource resource = getActive(id, domain);
        resource.setDeletedAt(Instant.now());
    }

    private Resource getActive(Long id, String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        return resourceRepository.findByIdAndDomainIdAndDeletedAtIsNull(id, domainId)
                .orElseThrow(() -> EntityNotFoundException.of("Resource", id));
    }
}

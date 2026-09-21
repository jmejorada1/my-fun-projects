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
        // is derived from it, not client-supplied (design-spec.md §4.3).
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
        Resource resource = getActive(id, domain);
        List<Long> resourceIds = List.of(id);

        // Same aggregation list() uses below, scoped to one resource — post
        // counts/flag summaries include replies, not just top-level posts
        // (no parent_post_id filter in either underlying query), so this
        // stays consistent with /rankings rather than the frontend's
        // previous top-level-only client-side summary.
        Map<Long, Long> postCountByResourceId = postCountByResourceId(resourceIds);
        Map<Long, List<ResourceFlagSummaryEntry>> flagSummaryByResourceId = flagSummaryByResourceId(resourceIds);

        return resourceMapper.toResponse(resource,
                postCountByResourceId.getOrDefault(id, 0L),
                flagSummaryByResourceId.getOrDefault(id, List.of()));
    }

    public Page<ResourceResponse> list(Long categoryId, String search, String domain, Pageable pageable) {
        Long domainId = domainService.requireByName(domain).getId();
        Page<Resource> resources = resourceRepository.search(domainId, categoryId, escapeLikePattern(search), pageable);

        List<Long> resourceIds = resources.getContent().stream().map(Resource::getId).toList();
        Map<Long, Long> postCountByResourceId = postCountByResourceId(resourceIds);
        Map<Long, List<ResourceFlagSummaryEntry>> flagSummaryByResourceId = flagSummaryByResourceId(resourceIds);

        return resources.map(resource -> resourceMapper.toResponse(resource,
                postCountByResourceId.getOrDefault(resource.getId(), 0L),
                flagSummaryByResourceId.getOrDefault(resource.getId(), List.of())));
    }

    private Map<Long, Long> postCountByResourceId(List<Long> resourceIds) {
        if (resourceIds.isEmpty()) {
            return Map.of();
        }
        return postRepository.countByResourceIdIn(resourceIds).stream()
                .collect(Collectors.toMap(PostRepository.ResourcePostCount::getResourceId,
                        PostRepository.ResourcePostCount::getPostCount));
    }

    private Map<Long, List<ResourceFlagSummaryEntry>> flagSummaryByResourceId(List<Long> resourceIds) {
        if (resourceIds.isEmpty()) {
            return Map.of();
        }
        return postFlagRepository.findFlagSummaryByResourceIdIn(resourceIds).stream()
                .collect(Collectors.groupingBy(PostFlagRepository.ResourceFlagSummaryRow::getResourceId,
                        Collectors.mapping(row -> new ResourceFlagSummaryEntry(
                                row.getPostTypeName(), row.getAvgScore(), row.getFlagCount()),
                                Collectors.toList())));
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

    /**
     * Escapes LIKE metacharacters ({@code \}, {@code %}, {@code _}) in a
     * user-supplied search term before it's wrapped in {@code %...%} and
     * bound into {@link ResourceRepository#search}'s query. Without this, a
     * literal {@code %} or {@code _} in someone's search text would act as
     * an unintended wildcard (e.g. searching for "50%" would match any
     * title containing "50" followed by anything) rather than being
     * matched literally — not SQL-injectable either way (the value is
     * always a bind parameter), just a correctness/hardening fix so the
     * search behaves as a plain substring match.
     */
    private static String escapeLikePattern(String search) {
        if (search == null) {
            return null;
        }
        return search
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }
}

package com.jp.projects.posts.web;

import com.jp.projects.posts.dto.resource.ResourceCreateRequest;
import com.jp.projects.posts.dto.resource.ResourceResponse;
import com.jp.projects.posts.service.ResourceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/resources")
@RequiredArgsConstructor
public class ResourceController {

    private final ResourceService resourceService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ResourceResponse create(@Valid @RequestBody ResourceCreateRequest request,
                                    @RequestHeader("X-Domain") String domain) {
        return resourceService.create(request, domain);
    }

    @GetMapping
    public Page<ResourceResponse> list(@RequestParam(required = false) Long categoryId,
                                        @RequestParam(required = false) String search,
                                        Pageable pageable,
                                        @RequestHeader("X-Domain") String domain) {
        return resourceService.list(categoryId, search, domain, pageable);
    }

    @GetMapping("/{id}")
    public ResourceResponse get(@PathVariable Long id, @RequestHeader("X-Domain") String domain) {
        return resourceService.get(id, domain);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @RequestHeader("X-Domain") String domain) {
        resourceService.softDelete(id, domain);
        return ResponseEntity.noContent().build();
    }
}

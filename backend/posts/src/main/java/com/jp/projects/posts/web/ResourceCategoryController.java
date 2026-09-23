package com.jp.projects.posts.web;

import com.jp.projects.posts.dto.category.ResourceCategoryResponse;
import com.jp.projects.posts.service.DomainRef;
import com.jp.projects.posts.service.ResourceCategoryService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/resource-categories")
@RequiredArgsConstructor
public class ResourceCategoryController {

    private final ResourceCategoryService resourceCategoryService;

    @GetMapping
    public List<ResourceCategoryResponse> list(@CurrentDomain DomainRef domain) {
        return resourceCategoryService.listAll(domain);
    }

    @GetMapping("/{id}")
    public ResourceCategoryResponse get(@PathVariable Long id, @CurrentDomain DomainRef domain) {
        return resourceCategoryService.get(id, domain);
    }
}

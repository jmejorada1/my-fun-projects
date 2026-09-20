package com.jp.projects.posts.web;

import com.jp.projects.posts.dto.category.ResourceCategoryResponse;
import com.jp.projects.posts.service.ResourceCategoryService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/resource-categories")
@RequiredArgsConstructor
public class ResourceCategoryController {

    private final ResourceCategoryService resourceCategoryService;

    @GetMapping
    public List<ResourceCategoryResponse> list(@RequestHeader("X-Domain") String domain) {
        return resourceCategoryService.listAll(domain);
    }

    @GetMapping("/{id}")
    public ResourceCategoryResponse get(@PathVariable Long id, @RequestHeader("X-Domain") String domain) {
        return resourceCategoryService.get(id, domain);
    }
}

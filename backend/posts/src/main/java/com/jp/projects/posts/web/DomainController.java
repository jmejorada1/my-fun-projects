package com.jp.projects.posts.web;

import com.jp.projects.posts.dto.domain.DomainResponse;
import com.jp.projects.posts.service.DomainService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Unlike every other controller, these two endpoints do not require an
 * {@code X-Domain} header — a frontend needs to be able to discover the
 * available domains before it knows which one to send.
 */
@RestController
@RequestMapping("/domains")
@RequiredArgsConstructor
public class DomainController {

    private final DomainService domainService;

    @GetMapping
    public List<DomainResponse> list() {
        return domainService.listAll();
    }

    @GetMapping("/{id}")
    public DomainResponse get(@PathVariable Long id) {
        return domainService.get(id);
    }
}

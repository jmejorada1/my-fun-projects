package com.jp.projects.posts.web;

import com.jp.projects.posts.dto.posttype.PostTypeResponse;
import com.jp.projects.posts.service.PostTypeService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/post-types")
@RequiredArgsConstructor
public class PostTypeController {

    private final PostTypeService postTypeService;

    @GetMapping
    public List<PostTypeResponse> list(@RequestHeader("X-Domain") String domain) {
        return postTypeService.listAll(domain);
    }

    @GetMapping("/{id}")
    public PostTypeResponse get(@PathVariable Long id, @RequestHeader("X-Domain") String domain) {
        return postTypeService.get(id, domain);
    }
}

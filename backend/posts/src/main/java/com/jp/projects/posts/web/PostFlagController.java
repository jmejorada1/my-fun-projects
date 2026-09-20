package com.jp.projects.posts.web;

import com.jp.projects.posts.dto.postflag.PostFlagCreateRequest;
import com.jp.projects.posts.dto.postflag.PostFlagResponse;
import com.jp.projects.posts.service.PostFlagService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/posts/{postId}/flags")
@RequiredArgsConstructor
public class PostFlagController {

    private final PostFlagService postFlagService;

    @PostMapping
    @ResponseStatus(HttpStatus.OK)
    public PostFlagResponse addOrUpdateFlag(@PathVariable Long postId,
                                             @Valid @RequestBody PostFlagCreateRequest request,
                                             @RequestHeader("X-Domain") String domain) {
        return postFlagService.addOrUpdateFlag(postId, request, domain);
    }

    @GetMapping
    public List<PostFlagResponse> listActiveFlags(@PathVariable Long postId,
                                                   @RequestHeader("X-Domain") String domain) {
        return postFlagService.listActiveFlags(postId, domain);
    }

    @DeleteMapping("/{flagId}")
    public ResponseEntity<Void> removeFlag(@PathVariable Long postId, @PathVariable Long flagId,
                                            @RequestHeader("X-User-Id") Long actingUserId,
                                            @RequestHeader("X-Domain") String domain) {
        postFlagService.removeFlag(flagId, actingUserId, domain);
        return ResponseEntity.noContent().build();
    }
}

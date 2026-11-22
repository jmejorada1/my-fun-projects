package com.jp.projects.posts.web;

import com.jp.projects.posts.dto.user.AppUserCreateRequest;
import com.jp.projects.posts.dto.user.AppUserResponse;
import com.jp.projects.posts.service.AppUserService;
import com.jp.projects.posts.service.DomainRef;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Placeholder until real auth (architecture.md §5); disabled under the prod profile. */
@RestController
@RequestMapping("/dev/users")
@Profile("!prod")
@RequiredArgsConstructor
public class AppUserController {

    private final AppUserService appUserService;

    /** 409 on a duplicate username or email. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AppUserResponse create(@Valid @RequestBody AppUserCreateRequest request,
                                   @CurrentDomain DomainRef domain) {
        return appUserService.create(request, domain);
    }

    @GetMapping("/by-username/{username}")
    public AppUserResponse findByUsername(@PathVariable String username, @CurrentDomain DomainRef domain) {
        return appUserService.findByUsername(username, domain);
    }

    @GetMapping
    public List<AppUserResponse> list(@CurrentDomain DomainRef domain) {
        return appUserService.list(domain);
    }

    @GetMapping("/{id}")
    public AppUserResponse get(@PathVariable Long id, @CurrentDomain DomainRef domain) {
        return appUserService.get(id, domain);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @CurrentDomain DomainRef domain) {
        appUserService.delete(id, domain);
        return ResponseEntity.noContent().build();
    }
}

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

/**
 * Temporary, dev-only (architecture.md §5). Unblocks
 * manual testing until real registration/auth exists — delete this
 * controller (and AppUserService, if nothing else needs it by then) once it
 * does. Guarded so it can't accidentally ship live.
 */
@RestController
@RequestMapping("/dev/users")
@Profile("!prod")
@RequiredArgsConstructor
public class AppUserController {

    private final AppUserService appUserService;

    /** Register (§19): always creates a new account; 409 on a duplicate username/email. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AppUserResponse create(@Valid @RequestBody AppUserCreateRequest request,
                                   @CurrentDomain DomainRef domain) {
        return appUserService.create(request, domain);
    }

    /** Login (§19): looks up an existing account by username; 404 if none exists. */
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

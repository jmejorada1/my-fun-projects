package com.jp.projects.posts.service;

import com.jp.projects.posts.dto.user.AppUserCreateRequest;
import com.jp.projects.posts.dto.user.AppUserResponse;
import com.jp.projects.posts.entity.AppUser;
import com.jp.projects.posts.exception.NotFoundException;
import com.jp.projects.posts.repository.AppUserRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Temporary, dev-only (architecture.md §5). Delete
 * this service (and its controller) once real registration/auth exists —
 * flagged as the seam where a Google identity provider would eventually
 * plug in instead.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class AppUserService {

    private final AppUserRepository appUserRepository;

    /**
     * Registration (§19): always creates a new account. No pre-check on
     * username/email uniqueness — that would be a race-prone
     * check-then-insert, same reasoning as ResourceService.create. A
     * violation surfaces as a 409 via GlobalExceptionHandler.
     */
    @Transactional
    public AppUserResponse create(AppUserCreateRequest request, DomainRef domain) {
        AppUser user = AppUser.builder()
                .domainId(domain.id())
                .username(request.username())
                .email(request.email())
                .firstName(request.firstName())
                .lastName(request.lastName())
                .data(request.data())
                .build();
        return toResponse(appUserRepository.save(user));
    }

    /** Login (§19): looks up an existing account by username; does not create one. */
    public AppUserResponse findByUsername(String username, DomainRef domain) {
        return toResponse(appUserRepository.findByDomainIdAndUsername(domain.id(), username)
                .orElseThrow(() -> new NotFoundException(
                        "AppUser with username '" + username + "' not found")));
    }

    public AppUserResponse get(Long id, DomainRef domain) {
        return toResponse(appUserRepository.findByIdAndDomainId(id, domain.id())
                .orElseThrow(() -> NotFoundException.of("AppUser", id)));
    }

    public List<AppUserResponse> list(DomainRef domain) {
        return appUserRepository.findAllByDomainId(domain.id()).stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * Hard delete, unlike every other deletable entity here — {@code app_user}
     * has no {@code deleted_at} column. Because {@code post.user_id} is a
     * real FK, this only succeeds for a user who has never posted; anyone
     * else's delete fails the constraint and surfaces as a 409. That
     * asymmetry is tracked in docs/code-review-findings.md §1.4 and should
     * be resolved when this dev-only surface is replaced by real auth.
     */
    @Transactional
    public void delete(Long id, DomainRef domain) {
        AppUser user = appUserRepository.findByIdAndDomainId(id, domain.id())
                .orElseThrow(() -> NotFoundException.of("AppUser", id));
        appUserRepository.delete(user);
    }

    private AppUserResponse toResponse(AppUser user) {
        return new AppUserResponse(
                user.getId(), user.getUsername(), user.getEmail(),
                user.getFirstName(), user.getLastName(),
                user.getCreatedAt(), user.getUpdatedAt());
    }
}

package com.jp.projects.posts.service;

import com.jp.projects.posts.dto.user.AppUserCreateRequest;
import com.jp.projects.posts.dto.user.AppUserResponse;
import com.jp.projects.posts.entity.AppUser;
import com.jp.projects.posts.exception.EntityNotFoundException;
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
    private final DomainService domainService;

    /**
     * Registration (§19): always creates a new account. No pre-check on
     * username/email uniqueness — that would be a race-prone
     * check-then-insert, same reasoning as ResourceService.create. A
     * violation surfaces as a 409 via GlobalExceptionHandler.
     */
    @Transactional
    public AppUserResponse create(AppUserCreateRequest request, String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        AppUser user = AppUser.builder()
                .domainId(domainId)
                .username(request.username())
                .email(request.email())
                .firstName(request.firstName())
                .lastName(request.lastName())
                .data(request.data())
                .build();
        return toResponse(appUserRepository.save(user));
    }

    /** Login (§19): looks up an existing account by username; does not create one. */
    public AppUserResponse findByUsername(String username, String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        return toResponse(appUserRepository.findByDomainIdAndUsername(domainId, username)
                .orElseThrow(() -> new EntityNotFoundException(
                        "AppUser with username '" + username + "' not found")));
    }

    public AppUserResponse get(Long id, String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        return toResponse(appUserRepository.findByIdAndDomainId(id, domainId)
                .orElseThrow(() -> EntityNotFoundException.of("AppUser", id)));
    }

    public List<AppUserResponse> list(String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        return appUserRepository.findAllByDomainId(domainId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public void delete(Long id, String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        AppUser user = appUserRepository.findByIdAndDomainId(id, domainId)
                .orElseThrow(() -> EntityNotFoundException.of("AppUser", id));
        appUserRepository.delete(user);
    }

    private AppUserResponse toResponse(AppUser user) {
        return new AppUserResponse(
                user.getId(), user.getUsername(), user.getEmail(),
                user.getFirstName(), user.getLastName(),
                user.getCreatedAt(), user.getUpdatedAt());
    }
}

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

/** Placeholder until real auth replaces it (architecture.md §5). */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class AppUserService {

    private final AppUserRepository appUserRepository;

    /** No uniqueness pre-check, which would race; the constraint violation becomes a 409. */
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
     * Hard delete ({@code app_user} has no {@code deleted_at}), so it 409s for anyone who has
     * posted. Tracked in docs/code-review-findings.md §1.4.
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

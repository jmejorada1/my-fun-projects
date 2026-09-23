package com.jp.projects.posts.config;

import com.jp.projects.posts.service.DomainRef;
import com.jp.projects.posts.service.DomainService;
import com.jp.projects.posts.web.CurrentDomain;
import lombok.RequiredArgsConstructor;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * Resolves {@link CurrentDomain} parameters from the {@code X-Domain}
 * header, exactly once per request.
 *
 * <p>Previously every handler declared the header itself and every service
 * method re-resolved it against the database — 22 call sites, and two or
 * three redundant {@code SELECT … FROM domain} round-trips on some
 * requests. The lookup now happens here and the result is passed down as a
 * {@link DomainRef}; {@link DomainService#requireByName} is additionally
 * cached, since {@code domain} is immutable seed data only a migration
 * changes.
 */
@Component
@RequiredArgsConstructor
public class CurrentDomainArgumentResolver implements HandlerMethodArgumentResolver {

    public static final String DOMAIN_HEADER = "X-Domain";

    private final DomainService domainService;

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentDomain.class)
                && DomainRef.class.isAssignableFrom(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                   NativeWebRequest webRequest, WebDataBinderFactory binderFactory)
            throws MissingRequestHeaderException {
        String name = webRequest.getHeader(DOMAIN_HEADER);
        if (name == null || name.isBlank()) {
            // Same 400 Spring produced for a missing @RequestHeader before.
            throw new MissingRequestHeaderException(DOMAIN_HEADER, parameter);
        }
        return domainService.requireByName(name);
    }
}

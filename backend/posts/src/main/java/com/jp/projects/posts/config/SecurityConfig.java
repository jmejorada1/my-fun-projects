package com.jp.projects.posts.config;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.CsrfConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${app.cors.allowed-origins}")
    private String[] allowedOrigins;

    // TODO(design-spec.md §6): replace with OAuth2/OIDC resource-server
    // config once an auth mechanism is chosen. Everything is open for now.
    // Note: this filter chain does not cover actuator endpoints — those run
    // on a separate management port (docs/architecture.md §9.5).
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .csrf(CsrfConfigurer::disable) // stateless JSON API; revisit alongside the real auth mechanism
                .build();
    }

    /**
     * frontend/imdb-ui-angular/docs/design-spec.md §3.7 — the Angular dev
     * server (and later, a deployed UI) calls this API cross-origin.
     * Origins come from {@code app.cors.allowed-origins} rather than a
     * wildcard, since there's no {@code allowCredentials} reason to need
     * one and an explicit list is easy to audit. {@code X-Domain}/
     * {@code X-User-Id} are custom headers the frontend sends on every
     * request, so allowed headers stay wildcarded rather than enumerated.
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(allowedOrigins));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}

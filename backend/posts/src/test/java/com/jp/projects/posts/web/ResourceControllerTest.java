package com.jp.projects.posts.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jp.projects.posts.config.CurrentDomainArgumentResolver;
import com.jp.projects.posts.config.SecurityConfig;
import com.jp.projects.posts.config.WebMvcConfig;
import com.jp.projects.posts.dto.category.ResourceCategoryResponse;
import com.jp.projects.posts.dto.resource.ResourceResponse;
import com.jp.projects.posts.exception.NotFoundException;
import com.jp.projects.posts.service.DomainRef;
import com.jp.projects.posts.service.DomainService;
import com.jp.projects.posts.service.ResourceService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * {@code WebMvcConfig}/{@code CurrentDomainArgumentResolver} are imported
 * explicitly: a {@code @WebMvcTest} slice doesn't pick up
 * {@code @Component} argument resolvers, and without them every
 * {@code @CurrentDomain} parameter would fail to resolve.
 */
@WebMvcTest(ResourceController.class)
@Import({SecurityConfig.class, WebMvcConfig.class, CurrentDomainArgumentResolver.class})
class ResourceControllerTest {

    private static final DomainRef DOMAIN = new DomainRef(1L, "imdb");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ResourceService resourceService;

    @MockitoBean
    private DomainService domainService;

    @BeforeEach
    void resolveDomain() {
        when(domainService.requireByName("imdb")).thenReturn(DOMAIN);
    }

    @Test
    void create_blankName_returns400WithFieldError() throws Exception {
        String body = """
                {"name":"","displayName":"Some Movie","categoryId":1}
                """;

        mockMvc.perform(post("/resources").contentType(MediaType.APPLICATION_JSON)
                        .header("X-Domain", "imdb").content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").exists());
    }

    @Test
    void create_valid_returns201() throws Exception {
        ResourceCategoryResponse category = new ResourceCategoryResponse(1L, "movie", "Movie");
        ResourceResponse response = new ResourceResponse(
                1L, "tt123", "A Movie", category, Instant.now(), Instant.now(), 0L, List.of());
        when(resourceService.create(any(), eq(DOMAIN))).thenReturn(response);

        String body = """
                {"name":"tt123","displayName":"A Movie","categoryId":1}
                """;

        mockMvc.perform(post("/resources").contentType(MediaType.APPLICATION_JSON)
                        .header("X-Domain", "imdb").content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.category.name").value("movie"));
    }

    @Test
    void get_notFound_returns404ProblemDetail() throws Exception {
        when(resourceService.get(99L, DOMAIN)).thenThrow(NotFoundException.of("Resource", 99L));

        mockMvc.perform(get("/resources/99").header("X-Domain", "imdb"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void missingDomainHeader_returns400() throws Exception {
        mockMvc.perform(get("/resources/1"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unknownDomain_returns404() throws Exception {
        when(domainService.requireByName("nope"))
                .thenThrow(new NotFoundException("Domain 'nope' not found"));

        mockMvc.perform(get("/resources/1").header("X-Domain", "nope"))
                .andExpect(status().isNotFound());
    }
}

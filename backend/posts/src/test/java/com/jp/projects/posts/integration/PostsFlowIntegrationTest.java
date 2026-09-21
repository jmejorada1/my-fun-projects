package com.jp.projects.posts.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jp.projects.posts.dto.post.PostResponse;
import com.jp.projects.posts.dto.post.ReplyCreateRequest;
import com.jp.projects.posts.dto.post.TopLevelPostCreateRequest;
import com.jp.projects.posts.dto.postflag.PostFlagCreateRequest;
import com.jp.projects.posts.dto.postflag.PostFlagResponse;
import com.jp.projects.posts.dto.resource.ResourceCreateRequest;
import com.jp.projects.posts.dto.resource.ResourceFlagSummaryEntry;
import com.jp.projects.posts.dto.resource.ResourceResponse;
import com.jp.projects.posts.dto.user.AppUserCreateRequest;
import com.jp.projects.posts.dto.user.AppUserResponse;
import java.util.List;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@Testcontainers
class PostsFlowIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void schemaProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.hikari.schema", () -> "posts");
    }

    @Autowired
    private TestRestTemplate restTemplate;

    // Every business endpoint requires an X-Domain header
    // (domain-scoping-spec.md D6/D15); adding it once here keeps the calls
    // below unchanged rather than threading it through every request.
    @BeforeEach
    void addDomainHeader() {
        restTemplate.getRestTemplate().setInterceptors(List.of((request, body, execution) -> {
            request.getHeaders().add("X-Domain", "imdb");
            return execution.execute(request, body);
        }));
    }

    /**
     * create resource -> post -> reply -> flag it twice (two types) ->
     * re-flag the same type (verify upsert, not a duplicate row) ->
     * soft-delete the top-level post -> verify the reply subtree is hidden
     * from the list endpoints (implementation-spec-spring-boot.md §14).
     */
    @Test
    void fullThreadLifecycle() throws Exception {
        AppUserResponse user = restTemplate.postForObject(
                "/dev/users",
                new AppUserCreateRequest("flow-user-" + System.nanoTime(), System.nanoTime() + "@example.com", null, null, null),
                AppUserResponse.class);

        ResourceResponse resource = restTemplate.postForObject(
                "/resources",
                new ResourceCreateRequest("tt-flow-" + System.nanoTime(), "Flow Movie", 1L, null),
                ResourceResponse.class);

        PostResponse topLevel = restTemplate.postForObject(
                "/resources/" + resource.id() + "/posts",
                new TopLevelPostCreateRequest(user.id(), "top level post", null),
                PostResponse.class);

        PostResponse reply = restTemplate.postForObject(
                "/posts/" + topLevel.id() + "/replies",
                new ReplyCreateRequest(user.id(), "a reply", null),
                PostResponse.class);
        assertThat(reply.resourceId()).isEqualTo(resource.id());

        // flag it twice, two different types
        restTemplate.postForObject("/posts/" + topLevel.id() + "/flags",
                new PostFlagCreateRequest(user.id(), 1L, 2), PostFlagResponse.class);
        restTemplate.postForObject("/posts/" + topLevel.id() + "/flags",
                new PostFlagCreateRequest(user.id(), 51L, 4), PostFlagResponse.class);

        // re-flag the same type: upsert, not a duplicate row
        restTemplate.postForObject("/posts/" + topLevel.id() + "/flags",
                new PostFlagCreateRequest(user.id(), 1L, 5), PostFlagResponse.class);

        // flag the REPLY too, with a type the top-level post doesn't have —
        // this is the scenario that used to slip past the resource-detail
        // page's summary (computed only from top-level posts) while still
        // correctly showing up in /rankings (which aggregates any post
        // depth); the resource-level assertions below check it's included.
        restTemplate.postForObject("/posts/" + reply.id() + "/flags",
                new PostFlagCreateRequest(user.id(), 101L, 3), PostFlagResponse.class);

        ResponseEntity<PostFlagResponse[]> flags = restTemplate.getForEntity(
                "/posts/" + topLevel.id() + "/flags", PostFlagResponse[].class);
        assertThat(flags.getBody()).hasSize(2);
        assertThat(List.of(flags.getBody()))
                .filteredOn(f -> f.postType().id().equals(1L))
                .extracting(PostFlagResponse::score)
                .containsExactly((short) 5);

        // the resource's post list (what the UI's expandable table renders)
        // includes each post's flags inline, batch-loaded rather than
        // requiring a separate /posts/{id}/flags call per row
        String topLevelPostsJson = restTemplate.getForObject(
                "/resources/" + resource.id() + "/posts?size=50", String.class);
        JsonNode topLevelFromList = StreamSupport
                .stream(new ObjectMapper().readTree(topLevelPostsJson).get("content").spliterator(), false)
                .filter(node -> node.get("id").asLong() == topLevel.id())
                .findFirst()
                .orElseThrow();
        assertThat(topLevelFromList.get("flags").size()).isEqualTo(2);
        assertThat(StreamSupport.stream(topLevelFromList.get("flags").spliterator(), false)
                .filter(f -> f.get("postType").get("id").asLong() == 1L)
                .map(f -> f.get("score").asInt()))
                .containsExactly(5);
        // the one reply created above, batch-counted rather than requiring
        // a separate /posts/{id}/replies call to know it exists
        assertThat(topLevelFromList.get("replyCount").asLong()).isEqualTo(1L);

        // the movie title, batch-loaded alongside the page — most useful on
        // the by-user endpoint (checked next), whose posts span many resources
        assertThat(topLevelFromList.get("resourceDisplayName").asText()).isEqualTo("Flow Movie");

        String userPostsJson = restTemplate.getForObject("/users/" + user.id() + "/posts?size=50", String.class);
        JsonNode userPostsContent = new ObjectMapper().readTree(userPostsJson).get("content");
        assertThat(StreamSupport.stream(userPostsContent.spliterator(), false)
                .filter(node -> node.get("id").asLong() == topLevel.id())
                .findFirst()
                .orElseThrow()
                .get("resourceDisplayName").asText())
                .isEqualTo("Flow Movie");

        // the resource search/list endpoint (search results page) includes
        // a total post count and a per-category flag summary, batch-loaded
        // rather than requiring a separate call per search result
        String searchJson = restTemplate.getForObject(
                "/resources?search=" + resource.displayName().replace(" ", "+"), String.class);
        JsonNode searchResult = StreamSupport
                .stream(new ObjectMapper().readTree(searchJson).get("content").spliterator(), false)
                .filter(node -> node.get("id").asLong() == resource.id())
                .findFirst()
                .orElseThrow();
        assertThat(searchResult.get("postCount").asLong()).isEqualTo(2L); // top-level post + its reply
        JsonNode flagSummary = searchResult.get("flagSummary");
        assertThat(flagSummary.size()).isEqualTo(3);
        assertThat(StreamSupport.stream(flagSummary.spliterator(), false)
                .filter(f -> f.get("postTypeName").asText().equals("racism"))
                .map(f -> f.get("averageScore").asDouble()))
                .containsExactly(5.0); // upserted from 2 to 5 above
        assertThat(StreamSupport.stream(flagSummary.spliterator(), false)
                .filter(f -> f.get("postTypeName").asText().equals("sexism"))
                .map(f -> f.get("flagCount").asLong()))
                .containsExactly(1L);
        // the reply-only flag, aggregated in alongside the top-level post's
        assertThat(StreamSupport.stream(flagSummary.spliterator(), false)
                .filter(f -> f.get("postTypeName").asText().equals("lgbtq-phobic"))
                .map(f -> f.get("averageScore").asDouble()))
                .containsExactly(3.0);

        // the single-resource read (what the resource-detail page's route
        // loads) reports the same aggregated postCount/flagSummary as the
        // list/search endpoint above, including the reply's flag — it used
        // to hardcode postCount=0 and flagSummary=[] instead of actually
        // computing them
        ResourceResponse singleResource = restTemplate.getForObject(
                "/resources/" + resource.id(), ResourceResponse.class);
        assertThat(singleResource.postCount()).isEqualTo(2L); // top-level post + its reply
        assertThat(singleResource.flagSummary()).hasSize(3);
        assertThat(singleResource.flagSummary())
                .filteredOn(f -> f.postTypeName().equals("lgbtq-phobic"))
                .extracting(ResourceFlagSummaryEntry::flagCount)
                .containsExactly(1L);

        // soft-delete the top-level post
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-User-Id", String.valueOf(user.id()));
        ResponseEntity<Void> deleteResponse = restTemplate.exchange(
                "/posts/" + topLevel.id(), HttpMethod.DELETE, new HttpEntity<>(headers), Void.class);
        assertThat(deleteResponse.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        // the reply subtree is hidden from the list endpoints
        ResponseEntity<String> topLevelAfterDelete = restTemplate.getForEntity(
                "/posts/" + topLevel.id(), String.class);
        assertThat(topLevelAfterDelete.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        ResponseEntity<String> replyAfterDelete = restTemplate.getForEntity(
                "/posts/" + reply.id(), String.class);
        assertThat(replyAfterDelete.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}

package com.jp.projects.posts.config;

import com.jp.projects.posts.web.CurrentDomain;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.parameters.Parameter;
import java.util.Arrays;
import org.springdoc.core.customizers.OperationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI postsOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Posts Service API")
                        .description("Threaded posts and content flags against IMDB-sourced resources.")
                        .version("v0.1"));
    }

    /**
     * Re-advertises the {@code X-Domain} header on every operation that
     * takes a {@link CurrentDomain} parameter.
     *
     * <p>springdoc discovered the header on its own while each handler
     * declared {@code @RequestHeader("X-Domain")}. Now that a custom
     * argument resolver supplies it, springdoc can't see it — without this
     * the documented contract would silently lose a required header, and
     * "Try it out" in Swagger UI would 400.
     */
    @Bean
    OperationCustomizer currentDomainHeaderCustomizer() {
        return (operation, handlerMethod) -> {
            boolean takesDomain = Arrays.stream(handlerMethod.getMethodParameters())
                    .anyMatch(parameter -> parameter.hasParameterAnnotation(CurrentDomain.class));
            if (takesDomain) {
                operation.addParametersItem(new Parameter()
                        .in("header")
                        .name(CurrentDomainArgumentResolver.DOMAIN_HEADER)
                        .required(true)
                        .description("The domain this request is scoped to, e.g. imdb/bigotry.")
                        .schema(new StringSchema()));
            }
            return operation;
        };
    }
}

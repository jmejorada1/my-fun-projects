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

    /** springdoc can't see headers read by an argument resolver, so document X-Domain here. */
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

package com.jp.projects.posts.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
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
}

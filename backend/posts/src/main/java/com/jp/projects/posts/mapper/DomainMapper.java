package com.jp.projects.posts.mapper;

import com.jp.projects.posts.dto.domain.DomainResponse;
import com.jp.projects.posts.entity.Domain;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface DomainMapper {

    DomainResponse toResponse(Domain domain);
}

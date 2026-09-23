package com.jp.projects.posts.service;

import com.jp.projects.posts.dto.posttype.PostTypeResponse;
import com.jp.projects.posts.entity.PostType;
import com.jp.projects.posts.exception.NotFoundException;
import com.jp.projects.posts.mapper.PostTypeMapper;
import com.jp.projects.posts.repository.PostTypeRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class PostTypeService {

    private final PostTypeRepository postTypeRepository;
    private final PostTypeMapper postTypeMapper;

    public List<PostTypeResponse> listAll(DomainRef domain) {
        return postTypeRepository.findAllByDomainId(domain.id()).stream()
                .map(postTypeMapper::toResponse)
                .toList();
    }

    public PostTypeResponse get(Long id, DomainRef domain) {
        PostType postType = postTypeRepository.findByIdAndDomainId(id, domain.id())
                .orElseThrow(() -> NotFoundException.of("PostType", id));
        return postTypeMapper.toResponse(postType);
    }
}

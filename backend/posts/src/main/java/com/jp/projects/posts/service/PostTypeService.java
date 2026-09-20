package com.jp.projects.posts.service;

import com.jp.projects.posts.dto.posttype.PostTypeResponse;
import com.jp.projects.posts.entity.PostType;
import com.jp.projects.posts.exception.EntityNotFoundException;
import com.jp.projects.posts.mapper.PostFlagMapper;
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
    private final PostFlagMapper postFlagMapper;
    private final DomainService domainService;

    public List<PostTypeResponse> listAll(String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        return postTypeRepository.findAllByDomainId(domainId).stream()
                .map(postFlagMapper::toResponse)
                .toList();
    }

    public PostTypeResponse get(Long id, String domain) {
        Long domainId = domainService.requireByName(domain).getId();
        PostType postType = postTypeRepository.findByIdAndDomainId(id, domainId)
                .orElseThrow(() -> EntityNotFoundException.of("PostType", id));
        return postFlagMapper.toResponse(postType);
    }
}

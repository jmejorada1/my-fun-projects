package com.jp.projects.posts.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * Deliberately no {@code @OneToMany(mappedBy = "parentPost") List<Post> replies}
 * collection — a post can have an unbounded reply subtree, so replies are
 * fetched explicitly (and paginated) through {@code PostRepository}.
 */
@Entity
@Table(name = "post")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@EntityListeners(AuditingEntityListener.class)
public class Post {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "post_id_seq")
    @SequenceGenerator(name = "post_id_seq", sequenceName = "post_id_seq", allocationSize = 50)
    @EqualsAndHashCode.Include
    private Long id;

    /**
     * Derived from {@code resource}'s domain, never set independently by a
     * client — enforced via composite FKs to {@code resource (id, domain_id)}
     * and {@code app_user (id, domain_id)} (domain-scoping-spec.md D12/D13).
     */
    @Column(name = "domain_id", nullable = false)
    private Long domainId;

    @Column(name = "resource_id", nullable = false)
    private Long resourceId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resource_id", insertable = false, updatable = false)
    private Resource resource;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", insertable = false, updatable = false)
    private AppUser user;

    @Column(name = "parent_post_id")
    private Long parentPostId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_post_id", insertable = false, updatable = false)
    private Post parentPost;

    @Column(name = "body_text", nullable = false)
    private String bodyText;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> data;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;
}

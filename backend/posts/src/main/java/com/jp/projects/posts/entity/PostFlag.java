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

@Entity
@Table(name = "post_flag")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@EntityListeners(AuditingEntityListener.class)
public class PostFlag {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "post_flag_id_seq")
    @SequenceGenerator(name = "post_flag_id_seq", sequenceName = "post_flag_id_seq", allocationSize = 50)
    @EqualsAndHashCode.Include
    private Long id;

    /**
     * Derived from {@code post}'s domain, never set independently by a
     * client — enforced via composite FKs to {@code post (id, domain_id)}
     * and {@code post_type (id, domain_id)} (domain-scoping-spec.md D12).
     */
    @Column(name = "domain_id", nullable = false)
    private Long domainId;

    @Column(name = "post_id", nullable = false)
    private Long postId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "post_id", insertable = false, updatable = false)
    private Post post;

    @Column(name = "post_type_id", nullable = false)
    private Long postTypeId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "post_type_id", insertable = false, updatable = false)
    private PostType postType;

    @Column(nullable = false)
    private Short score;

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

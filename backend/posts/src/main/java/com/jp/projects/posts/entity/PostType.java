package com.jp.projects.posts.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
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
@Table(name = "post_type", uniqueConstraints =
        @UniqueConstraint(name = "uq_post_type_domain_name", columnNames = {"domain_id", "name"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@EntityListeners(AuditingEntityListener.class)
public class PostType {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "post_type_id_seq")
    @SequenceGenerator(name = "post_type_id_seq", sequenceName = "post_type_id_seq", allocationSize = 50)
    @EqualsAndHashCode.Include
    private Long id;

    @Column(name = "domain_id", nullable = false)
    private Long domainId;

    @Column(nullable = false, length = 64)
    private String name;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> data;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}

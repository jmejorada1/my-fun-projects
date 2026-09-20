# Posts Service — Spring Boot Implementation Spec (v0.1)

Status: Implemented (§1–§16 built; §17 domain-scoping addendum built and
tested — see [`CHANGELOG.md`](./CHANGELOG.md))
Companion to: [`design-spec.md`](./design-spec.md) (data model, business
rules, confirmed decisions) and [`db-design-spec.md`](./db-design-spec.md)
(ERD narrative)

This document translates the confirmed data model into a concrete Spring
Boot implementation plan: dependencies, package layout, migrations, entity
mappings, repositories, services, the REST surface, error handling, and
testing strategy. It does not change anything in the data model itself —
where something here depends on an item still marked open in
`design-spec.md` §7, that's called out explicitly rather than guessed at.

## Table of Contents

- [1. Baseline (already in the repo)](#1-baseline-already-in-the-repo)
- [2. Dependencies to Add](#2-dependencies-to-add)
- [3. Package Structure](#3-package-structure)
- [4. Database Migrations (Flyway)](#4-database-migrations-flyway)
- [5. JPA Entity Mapping](#5-jpa-entity-mapping)
- [6. Repositories (Spring Data JPA)](#6-repositories-spring-data-jpa)
- [7. Service Layer](#7-service-layer)
- [8. REST API Surface](#8-rest-api-surface)
- [9. DTOs](#9-dtos)
- [10. Mapping (MapStruct)](#10-mapping-mapstruct)
- [11. Error Handling](#11-error-handling)
- [12. Security (Stub)](#12-security-stub)
- [13. API Documentation](#13-api-documentation)
- [14. Testing Strategy](#14-testing-strategy)
- [15. Resolved Items](#15-resolved-items)
- [16. Addendum: Unified Post Creation Endpoint](#16-addendum-unified-post-creation-endpoint)
- [17. Addendum: Domain Scoping](#17-addendum-domain-scoping)
- [18. Addendum: Neutral Severity Score (0)](#18-addendum-neutral-severity-score-0)
- [Appendix A: Running the Application Locally](#appendix-a-running-the-application-locally)
  - [Prerequisites](#prerequisites)
  - [Starting Postgres](#starting-postgres)
  - [Running the app](#running-the-app)
  - [Building and testing](#building-and-testing)
- [Appendix B: Adding Users, Resources, and Posts](#appendix-b-adding-users-resources-and-posts)
  - [1. Create a user (dev-only, §8)](#1-create-a-user-dev-only-8)
  - [2. Look up a resource category](#2-look-up-a-resource-category)
  - [3. Create a resource](#3-create-a-resource)
  - [4. Create a top-level post on that resource](#4-create-a-top-level-post-on-that-resource)
  - [5. Reply to a post](#5-reply-to-a-post)
  - [5b. Or: create a post (top-level or reply) via the unified endpoint (§16)](#5b-or-create-a-post-top-level-or-reply-via-the-unified-endpoint-16)
  - [6. Flag a post](#6-flag-a-post)
  - [7. Edit or delete a post](#7-edit-or-delete-a-post)
  - [Reminder](#reminder)

## 1. Baseline (already in the repo)

From `pom.xml` / `PostsApplication.java`, unchanged by this spec:

- Spring Boot **4.1.1** (parent BOM), Java **25**
- Base package: `com.jp.projects.posts`
- Already present: `spring-boot-starter-data-jpa`, `spring-boot-starter-webmvc`,
  `spring-boot-starter-security`, `spring-boot-devtools`, PostgreSQL driver,
  plus the `-test` counterparts for JPA/security/webmvc.

Note: this project runs on a very recent Spring Boot release. A few details
below (exact transitive versions, minor API shapes) should be double-checked
against the actual Spring Boot 4.1 docs at implementation time rather than
taken as certain — flagged inline where relevant.

## 2. Dependencies to Add

Confirmed with the requester:

| Dependency | Purpose | Scope |
|---|---|---|
| `org.flywaydb:flyway-core` (+ `flyway-database-postgresql`, required separately since Flyway 10 split out Postgres support — verify which Flyway version Boot 4.1's BOM pulls in) | Versioned schema migrations | runtime |
| `org.springframework.boot:spring-boot-starter-validation` | Jakarta Bean Validation for request DTOs | compile |
| `org.projectlombok:lombok` | Reduce entity/DTO boilerplate | provided/annotationProcessor |
| `org.mapstruct:mapstruct` + `mapstruct-processor` (+ `lombok-mapstruct-binding` to fix annotation-processor ordering with Lombok) | Compile-time entity ↔ DTO mapping | compile / annotationProcessor |
| `org.springdoc:springdoc-openapi-starter-webmvc-ui` | OpenAPI/Swagger docs + UI | compile |
| `org.testcontainers:testcontainers`, `junit-jupiter`, `postgresql`, and `org.springframework.boot:spring-boot-testcontainers` | Integration tests against a real Postgres container (H2 doesn't support `jsonb`, partial unique indexes, or the composite FK used by `post`) | test |

`spring-boot-testcontainers` gives us Boot's `@ServiceConnection` support so
a `@Container` Postgres instance auto-wires `spring.datasource.*` in tests
without manual `@DynamicPropertySource` plumbing.

## 3. Package Structure

Layer-based grouping (appropriate at this size; revisit to package-by-feature
if the domain grows significantly):

```
com.jp.projects.posts
├── PostsApplication
├── config
│   ├── SecurityConfig
│   ├── OpenApiConfig
│   └── JpaAuditingConfig
├── entity
│   ├── AppUser
│   ├── ResourceCategory
│   ├── Resource
│   ├── PostType
│   ├── Post
│   └── PostFlag
├── repository
│   ├── AppUserRepository
│   ├── ResourceCategoryRepository
│   ├── ResourceRepository
│   ├── PostTypeRepository
│   ├── PostRepository
│   └── PostFlagRepository
├── service
│   ├── ResourceService
│   ├── ResourceCategoryService
│   ├── PostTypeService
│   ├── PostService
│   └── PostFlagService
├── web
│   ├── ResourceController
│   ├── ResourceCategoryController
│   ├── PostTypeController
│   ├── PostController
│   └── PostFlagController
├── dto
│   ├── resource (...)
│   ├── post (...)
│   └── postflag (...)
├── mapper
│   ├── ResourceMapper
│   ├── PostMapper
│   └── PostFlagMapper
└── exception
    ├── EntityNotFoundException
    ├── ForbiddenOperationException
    └── GlobalExceptionHandler
```

`app_user` gets an **entity + repository only** — no service/controller yet.
See §8 on why a User REST API is deliberately out of scope for this pass.

## 4. Database Migrations (Flyway)

`src/main/resources/db/migration/`, one focused change per file. DDL mirrors
`design-spec.md` §4.3 exactly, including the composite FK for reply/resource
scoping and the partial unique index for `post_flag`.

**V1\_\_create_lookup_tables.sql**

```sql
CREATE SEQUENCE resource_category_id_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE resource_category (
    id            BIGINT PRIMARY KEY DEFAULT nextval('resource_category_id_seq'),
    name          VARCHAR(64) NOT NULL,
    display_name  VARCHAR(128) NOT NULL,
    data          JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_resource_category_name UNIQUE (name)
);
ALTER SEQUENCE resource_category_id_seq OWNED BY resource_category.id;

CREATE SEQUENCE post_type_id_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE post_type (
    id          BIGINT PRIMARY KEY DEFAULT nextval('post_type_id_seq'),
    name        VARCHAR(64) NOT NULL,
    data        JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_post_type_name UNIQUE (name)
);
ALTER SEQUENCE post_type_id_seq OWNED BY post_type.id;
```

**V2\_\_seed_lookup_tables.sql**

```sql
INSERT INTO resource_category (name, display_name) VALUES
    ('movie', 'Movie'),
    ('short', 'Short Film'),
    ('tvSeries', 'TV Series'),
    ('tvEpisode', 'TV Episode'),
    ('tvMiniSeries', 'TV Mini-Series'),
    ('tvMovie', 'TV Movie'),
    ('tvSpecial', 'TV Special'),
    ('tvShort', 'TV Short'),
    ('video', 'Video'),
    ('videoGame', 'Video Game');

INSERT INTO post_type (name) VALUES
    ('racism'),
    ('sexism'),
    ('lgbtq-phobic');
```

**V3\_\_create_app_user_table.sql**

```sql
CREATE SEQUENCE app_user_id_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE app_user (
    id          BIGINT PRIMARY KEY DEFAULT nextval('app_user_id_seq'),
    username    VARCHAR(64) NOT NULL,
    email       VARCHAR(255) NOT NULL,
    first_name  VARCHAR(128),
    last_name   VARCHAR(128),
    data        JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_app_user_username UNIQUE (username),
    CONSTRAINT uq_app_user_email UNIQUE (email)
);
ALTER SEQUENCE app_user_id_seq OWNED BY app_user.id;
```

**V4\_\_create_resource_table.sql**

```sql
CREATE SEQUENCE resource_id_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE resource (
    id            BIGINT PRIMARY KEY DEFAULT nextval('resource_id_seq'),
    name          VARCHAR(32) NOT NULL,
    display_name  VARCHAR(512) NOT NULL,
    category_id   BIGINT NOT NULL REFERENCES resource_category (id),
    data          JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    CONSTRAINT uq_resource_name UNIQUE (name)
);
ALTER SEQUENCE resource_id_seq OWNED BY resource.id;
CREATE INDEX idx_resource_category_id ON resource (category_id);
```

**V5\_\_create_post_table.sql**

```sql
CREATE SEQUENCE post_id_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE post (
    id               BIGINT PRIMARY KEY DEFAULT nextval('post_id_seq'),
    resource_id      BIGINT NOT NULL REFERENCES resource (id),
    user_id          BIGINT NOT NULL REFERENCES app_user (id),
    parent_post_id   BIGINT,
    body_text        TEXT NOT NULL,
    data             JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ,
    CONSTRAINT uq_post_id_resource UNIQUE (id, resource_id)
);
ALTER SEQUENCE post_id_seq OWNED BY post.id;

ALTER TABLE post
    ADD CONSTRAINT fk_post_parent_same_resource
    FOREIGN KEY (parent_post_id, resource_id) REFERENCES post (id, resource_id);

CREATE INDEX idx_post_resource_id ON post (resource_id);
CREATE INDEX idx_post_user_id ON post (user_id);
CREATE INDEX idx_post_parent_post_id ON post (parent_post_id);
```

**V6\_\_create_post_flag_table.sql**

```sql
CREATE SEQUENCE post_flag_id_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE post_flag (
    id             BIGINT PRIMARY KEY DEFAULT nextval('post_flag_id_seq'),
    post_id        BIGINT NOT NULL REFERENCES post (id),
    post_type_id   BIGINT NOT NULL REFERENCES post_type (id),
    score          SMALLINT NOT NULL,
    data           JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ,
    CONSTRAINT chk_post_flag_score CHECK (score BETWEEN 1 AND 5)
);
ALTER SEQUENCE post_flag_id_seq OWNED BY post_flag.id;

CREATE UNIQUE INDEX uq_post_flag_active_post_type
    ON post_flag (post_id, post_type_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_post_flag_post_id ON post_flag (post_id);
```

VARCHAR lengths above are conservative placeholders, adjustable without a
design change at implementation time.

## 5. JPA Entity Mapping

General conventions for every entity:

- `@Id @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "...")`
  `@SequenceGenerator(name = "...", sequenceName = "..._id_seq", allocationSize = 50)`
  — matches the migration's sequence, and lets Hibernate batch inserts
  instead of round-tripping per row (`IDENTITY` disables JDBC batching).
- `data` mapped as `Map<String, Object>` with `@JdbcTypeCode(SqlTypes.JSON)`
  (Hibernate 6's native JSON mapping — no extra library needed).
- `created_at`/`updated_at` populated via Spring Data JPA auditing
  (`@CreatedDate`, `@LastModifiedDate`, `@EntityListeners(AuditingEntityListener.class)`),
  enabled once via `@EnableJpaAuditing` in `JpaAuditingConfig`.
- Lombok: `@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder`
  on entities — **deliberately not `@Data`**. `@Data`'s generated
  `equals`/`hashCode` operate over every field, which breaks badly with JPA
  lazy proxies and mutable entities; `equals`/`hashCode` should be
  hand-written (or `@EqualsAndHashCode(onlyExplicitlyIncluded = true)`) based
  on `id` only.
- All `@ManyToOne` associations are `fetch = FetchType.LAZY` — no exceptions,
  to avoid accidental deep graph loads.

**Post** specifics:

- `parentPost` is a self-referencing `@ManyToOne(fetch = LAZY) @JoinColumn(name = "parent_post_id")`.
- Deliberately **no** `@OneToMany(mappedBy = "parentPost") List<Post> replies`
  collection on the entity. A post can have an unbounded reply subtree;
  exposing it as a lazy collection invites accidental full-subtree loads or
  N+1 queries. Replies are fetched explicitly through `PostRepository` query
  methods instead (paginated — see §6).
- `resourceId` and `parentPostId` are also kept as plain `Long` fields
  alongside the `@ManyToOne` objects (a common pattern) so services can
  compare/set them without forcing a proxy fetch.

**PostFlag**, **Resource**: same pattern — plain `Long` foreign key fields
plus lazy `@ManyToOne` where the related entity's own fields are needed.

Not currently in the schema, flagging as a suggestion rather than adding it
silently: an optimistic-locking `@Version` column on `post` and
`post_flag` would guard against lost updates on concurrent edits. This is a
schema change, so it belongs in `design-spec.md` if you want it — not adding
it here without that confirmation.

## 6. Repositories (Spring Data JPA)

All extend `JpaRepository<Entity, Long>` plus:

- **AppUserRepository** — `findByUsername`, `findByEmail`
- **ResourceCategoryRepository** — `findByName`, `findAll` (small, static — no pagination needed)
- **ResourceRepository** — `findByIdAndDeletedAtIsNull`, `findByNameAndDeletedAtIsNull`, `Page<Resource> findAllByDeletedAtIsNull(Pageable)`, optionally `findAllByCategoryIdAndDeletedAtIsNull(Long, Pageable)`
- **PostTypeRepository** — `findByName`, `findAll`
- **PostRepository**:
  - `findByIdAndDeletedAtIsNull`
  - `Page<Post> findByResourceIdAndParentPostIdIsNullAndDeletedAtIsNull(Long resourceId, Pageable)` — top-level posts
  - `Page<Post> findByParentPostIdAndDeletedAtIsNull(Long parentPostId, Pageable)` — direct replies to a post
  - A cascading soft-delete operation for a post's subtree — **confirmed:
    write-time recursive cascade** (resolves `design-spec.md` §7).
    `@Modifying` queries only execute inside an existing transaction, so this
    must always be called from a `@Transactional` service method (§7),
    never directly from a controller:
    ```java
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
        WITH RECURSIVE subtree AS (
            SELECT id FROM post WHERE id = :postId
            UNION ALL
            SELECT p.id FROM post p JOIN subtree s ON p.parent_post_id = s.id
        )
        UPDATE post SET deleted_at = now()
        WHERE id IN (SELECT id FROM subtree) AND deleted_at IS NULL
        """, nativeQuery = true)
    void softDeleteSubtree(@Param("postId") Long postId);
    ```
    `clearAutomatically` drops the persistence context after the bulk update
    so any `Post` already loaded earlier in the same transaction (e.g. the
    one just fetched for the ownership check) doesn't linger with stale
    in-memory state.
- **PostFlagRepository** — `findByPostIdAndDeletedAtIsNull`, `existsByPostIdAndPostTypeIdAndDeletedAtIsNull`, `findByPostIdAndPostTypeIdAndDeletedAtIsNull`

## 7. Service Layer

Each service is annotated `@Transactional(readOnly = true)` at the class
level (a safe default that also lets Hibernate skip dirty-checking on plain
reads), with individual mutating methods overridden to plain
`@Transactional`:

```java
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class PostService {

    private final PostRepository postRepository;

    public Post getActive(Long postId) { ... }        // inherits readOnly = true

    @Transactional
    public Post createReply(Long parentPostId, ReplyCreateRequest request) { ... }

    @Transactional
    public void deletePost(Long postId, Long actingUserId) { ... }
}
```

Business rules enforced here (not left to controllers or the DB alone):

- **ResourceService** — create/get/list/soft-delete. `create` doesn't
  pre-check whether `name` already exists — that would be a race-prone
  check-then-insert — it relies on the DB's unique constraint and lets
  `GlobalExceptionHandler` turn the resulting `DataIntegrityViolationException`
  into a 409. `create`/`softDelete` are `@Transactional`.
- **PostService**:
  - `createTopLevelPost(resourceId, ...)` — `parentPostId = null`. `@Transactional`.
  - `createReply(parentPostId, ...)` — looks up the parent, **derives
    `resourceId` from the parent** rather than accepting it from the client,
    enforcing the "a reply inherits its thread's resource" rule from
    `design-spec.md` §2. `@Transactional` — the parent lookup and the insert
    must be one atomic unit.
  - `updatePostText(postId, actingUserId, newText)` — verifies
    `actingUserId == post.userId` (see the ownership caveat in §8) before
    overwriting `body_text` in place — no edit history, per the confirmed
    decision. `@Transactional`.
  - `deletePost(postId, actingUserId)` — verifies ownership, then calls
    `PostRepository.softDeleteSubtree`. **Both steps run inside the same**
    **`@Transactional` method** — if the cascade fails, the
    ownership-verified delete of the root post shouldn't stick either, and
    `@Modifying` queries require an existing transaction anyway (§6).
- **PostFlagService**:
  - `addOrUpdateFlag(postId, actingUserId, postTypeId, score)` — upsert by
    type. A naive "check whether an active flag exists, then insert or
    update" is a race under concurrent requests: two simultaneous calls can
    both observe "no active flag" and both attempt an insert, with only one
    surviving the partial unique index — the other fails with a constraint
    violation instead of behaving like an upsert. Implemented instead as a
    single `@Transactional` method backed by a native Postgres upsert, which
    is atomic by construction:
    ```sql
    INSERT INTO post_flag (post_id, post_type_id, score)
    VALUES (:postId, :postTypeId, :score)
    ON CONFLICT (post_id, post_type_id)
    WHERE deleted_at IS NULL
    DO UPDATE SET score = EXCLUDED.score, updated_at = now()
    ```
    (Postgres supports targeting a partial unique index with `ON CONFLICT`
    this way.)
  - `removeFlag(flagId, actingUserId)` — soft delete, ownership-checked
    against the parent post's author. `@Transactional`.
- **ResourceCategoryService**, **PostTypeService** — thin read-only
  pass-throughs for the lookup controllers; no overrides needed, they
  inherit the class-level `readOnly = true`.
- **AppUserService** *(temporary, dev-only — see §8)* — `create`, `get`,
  `list`, `delete`. Plain CRUD; `create`/`delete` are `@Transactional`.

## 8. REST API Surface

As of the domain-scoping addendum (§17), every endpoint in this table
**except** `/domains` and `/domains/{id}` additionally requires an
`X-Domain` header.

| Method | Path | Purpose |
|---|---|---|
| GET | `/domains` | List all domains (lookup — no `X-Domain` header needed) |
| GET | `/domains/{id}` | Get one domain (no `X-Domain` header needed) |
| GET | `/resource-categories` | List all categories (lookup) |
| GET | `/resource-categories/{id}` | Get one category |
| GET | `/post-types` | List all post types (lookup) |
| GET | `/post-types/{id}` | Get one post type |
| POST | `/resources` | Create a resource |
| GET | `/resources` | Paginated list, optional `?categoryId=` filter |
| GET | `/resources/{id}` | Get one resource |
| DELETE | `/resources/{id}` | Soft-delete a resource |
| POST | `/resources/{resourceId}/posts` | Create a top-level post |
| GET | `/resources/{resourceId}/posts` | Paginated top-level posts for a resource |
| POST | `/posts/{postId}/replies` | Create a reply (server derives `resourceId` from parent) |
| GET | `/posts/{postId}/replies` | Paginated **direct** replies (not the whole subtree) |
| GET | `/posts/{postId}` | Get one post |
| PATCH | `/posts/{postId}` | Edit `body_text` |
| DELETE | `/posts/{postId}` | Soft-delete (cascades to reply subtree) |
| POST | `/posts/{postId}/flags` | Add/update a flag (upsert by type) |
| GET | `/posts/{postId}/flags` | List active flags on a post |
| DELETE | `/posts/{postId}/flags/{flagId}` | Soft-delete a flag |

Two deliberate scoping decisions, both open to revisit:

- **No full recursive "get whole thread" endpoint.** Replies are fetched one
  level at a time (paginated), which keeps response sizes bounded. A
  recursive thread-fetch endpoint is a reasonable future addition but isn't
  required by `design-spec.md` — not building it speculatively.
- **Temporary `app_user` endpoints, dev-only — confirmed.** `design-spec.md`
  §6 still defers real auth, and user provisioning will eventually come from
  whatever auth mechanism is chosen (OAuth2/OIDC registration flow, etc.).
  Until then there's no way to create the test users needed to exercise the
  `userId` fields used elsewhere in this API, so a minimal, explicitly
  temporary `AppUserController` is included:

  | Method | Path | Purpose |
  |---|---|---|
  | POST | `/dev/users` | Create a test user |
  | GET | `/dev/users` | List users |
  | GET | `/dev/users/{id}` | Get one user |
  | DELETE | `/dev/users/{id}` | Hard-delete a test user (`app_user` has no `deleted_at` in the schema) |

  Under a `/dev/...` prefix, and guarded with `@Profile("!prod")`, so it's
  both obviously temporary in the codebase and can't accidentally ship live.
  Delete this controller (and `AppUserService`, if nothing else needs it by
  then) once real registration/auth exists.

**Confirmed:** with security stubbed open (§12), there is no authenticated
principal to read the "acting user" from for ownership checks (edit/delete
post, delete flag) or for setting the author on creation.
`POST`/`PATCH`/`DELETE` request bodies (or a header, for the `DELETE` cases
with no body) carry an explicit `userId` — understood as **not
security-enforced** (anyone can claim any `userId` until real auth lands),
just enough to exercise the business logic and DB constraints end-to-end.
Reflected in the DTOs in §9.

## 9. DTOs

Java `record`s with Jakarta Bean Validation annotations, one request/response
pair per operation rather than reusing a single DTO everywhere (avoids
over-posting and keeps validation rules specific to the operation). E.g.:

```java
public record ResourceCreateRequest(
    @NotBlank @Size(max = 32) String name,
    @NotBlank @Size(max = 512) String displayName,
    @NotNull Long categoryId,
    Map<String, Object> data
) {}

public record ResourceResponse(
    Long id, String name, String displayName,
    ResourceCategoryResponse category,
    Instant createdAt, Instant updatedAt
) {}

public record ReplyCreateRequest(
    @NotNull Long userId,          // see the ownership caveat in §8
    @NotBlank String bodyText,
    Map<String, Object> data
) {}

public record PostFlagCreateRequest(
    @NotNull Long userId,          // see the ownership caveat in §8
    @NotNull Long postTypeId,
    @NotNull @Min(0) @Max(5) Integer score          // 0 = neutral, §18
) {}

// Temporary, dev-only (§8)
public record AppUserCreateRequest(
    @NotBlank @Size(max = 64) String username,
    @NotBlank @Email @Size(max = 255) String email,
    @Size(max = 128) String firstName,
    @Size(max = 128) String lastName,
    Map<String, Object> data
) {}

public record AppUserResponse(
    Long id, String username, String email,
    String firstName, String lastName,
    Instant createdAt, Instant updatedAt
) {}
```

`PostResponse` intentionally omits a nested `replies` field for the same
reason the entity has no `@OneToMany` — replies are fetched via the separate
paginated endpoint.

## 10. Mapping (MapStruct)

One `@Mapper(componentModel = "spring")` interface per aggregate
(`ResourceMapper`, `PostMapper`, `PostFlagMapper`), generating
entity → response mappings. Request → entity construction stays in the
service layer (it usually needs lookups — e.g. resolving `categoryId` to a
`ResourceCategory` — that don't belong in a pure mapper).

## 11. Error Handling

`@RestControllerAdvice GlobalExceptionHandler`, returning Spring's built-in
`ProblemDetail` (RFC 7807) for every case:

| Exception | Status |
|---|---|
| `EntityNotFoundException` (custom) | 404 |
| `ForbiddenOperationException` (custom — ownership check failure) | 403 |
| `MethodArgumentNotValidException` (bean validation) | 400, with per-field errors |
| `DataIntegrityViolationException` (unique constraint / FK / check violation) | 409 |

## 12. Security (Stub)

Confirmed: keep `spring-boot-starter-security` on the classpath, but don't
build real auth yet.

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    // TODO(design-spec.md §6): replace with OAuth2/OIDC resource-server
    // config once an auth mechanism is chosen. Everything is open for now.
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
            .csrf(CsrfConfigurer::disable) // stateless JSON API; revisit alongside the real auth mechanism
            .build();
    }
}
```

Without this, Spring Security's autoconfiguration would otherwise lock down
every endpoint behind a generated default-user login, which would silently
break all API calls.

## 13. API Documentation

`springdoc-openapi-starter-webmvc-ui` needs no controller changes to produce
docs at `/v3/api-docs` and a browsable UI at `/swagger-ui.html`. A small
`OpenApiConfig` supplies title/description/version metadata via an `OpenAPI`
bean.

## 14. Testing Strategy

- **Unit** — service layer, JUnit 5 + Mockito, repositories mocked.
- **Repository** — `@DataJpaTest` + Testcontainers Postgres (`@ServiceConnection`
  on a `@Container static PostgreSQLContainer<>`). Runs the real Flyway
  migrations, so this is what actually verifies the unique constraints, the
  `CHECK (score BETWEEN 0 AND 5)`, the composite FK on `post`, and the
  partial unique index on `post_flag` — none of which H2 can faithfully
  reproduce.
- **Web** — `@WebMvcTest` per controller + `MockMvc`, service layer mocked;
  verifies request validation and the `ProblemDetail` error shapes.
- **Integration** — `@SpringBootTest(webEnvironment = RANDOM_PORT)` +
  Testcontainers, a handful of end-to-end happy-path/edge-case flows, e.g.:
  create resource → post → reply → flag it twice (two types) → re-flag the
  same type (verify upsert, not a duplicate row) → soft-delete the
  top-level post → verify the reply subtree is hidden from the list
  endpoints.

## 15. Resolved Items

All previously-open items are now confirmed and reflected throughout this
document:

1. **Cascading soft-delete**: write-time recursive cascade (§6). This is the
   right trade-off here — it makes deletes slightly more expensive (one
   recursive CTE) in exchange for cheap reads on every thread listing, and a
   comment thread is read far more often than it's deleted.
2. **Resource creation**: `POST /resources` accepts arbitrary data, no
   validation against the IMDB dataset (§7, `ResourceService.create`).
3. **Acting-user identification**: explicit `userId` in request bodies/headers,
   unenforced until real auth exists (§8, §9). This surfaced the need for a
   way to actually create test users, so a temporary, `@Profile`-gated
   `/dev/users` CRUD API was added (§8, §9) to unblock manual testing until
   real registration/auth lands.

No open items remain before implementation can start.

## 16. Addendum: Unified Post Creation Endpoint

Added after initial implementation, at the requester's request — a single
entry point for creating a post (top-level or reply) instead of the two
separate ones in §8. The original two endpoints are **unchanged and still
supported**; this is an additional, alternative way in.

| Method | Path | Purpose |
|---|---|---|
| POST | `/posts` | Create a post — top-level if `parentPostId` is omitted, a reply if it's present |

**Request** (`PostCreateRequest`):

```java
public record PostCreateRequest(
    @NotBlank String username,
    @NotNull Long resourceId,
    Long parentPostId,          // optional — presence makes this a reply
    @NotBlank String bodyText,
    Long postTypeId,            // optional — must be paired with score
    @Min(0) @Max(5) Integer score,   // 0 = neutral, §18
    Map<String, Object> data
) {}
```

**Response** (`PostCreateResponse`): `{ post: PostResponse, flag: PostFlagResponse | null }`.

Decisions made for this addendum, following the same "ask rather than guess"
approach as the rest of this document:

- **Author identified by `username`, not `userId`.** Unlike every other
  write endpoint in §8/§9, this one resolves `AppUserRepository.findByUsername`
  server-side (404 if unknown) rather than trusting a client-supplied ID.
  This is a deliberate inconsistency with the rest of the API's
  not-yet-authenticated `userId` pattern (§8) — acceptable for now since
  it's additive, but worth reconciling once real auth lands and an
  authenticated principal replaces both approaches.
- **`resourceId` is always required in the body, even for replies.** When
  `parentPostId` is present, the server derives the effective resourceId
  from the parent and **ignores** whatever `resourceId` the client sent —
  same "a reply inherits its thread's resource" rule as `createReply` (§2
  of `design-spec.md`, §7 of this doc). A mismatched client value is
  silently overridden rather than rejected, consistent with how the
  existing reply endpoint already behaves.
- **`postTypeId`/`score` are optional but coupled.** If provided, the post
  is created and flagged in the same transaction (via
  `PostFlagService.addOrUpdateFlag`, joining the caller's transaction under
  Spring's default propagation — a failure in either half rolls back both).
  Providing one without the other is a `400` (`IllegalArgumentException` →
  `GlobalExceptionHandler`), not a partial success.
- Implemented as `PostService.createPost` + `PostController.createPost`;
  covered by unit tests in `PostServiceTest` and exercised manually against
  a running instance (see Appendix B).

## 17. Addendum: Domain Scoping

Added after the initial implementation (§1–§16), implementing the confirmed
design in [`domain-scoping-spec.md`](./domain-scoping-spec.md) (see also
[`CHANGELOG.md`](./CHANGELOG.md) and `design-spec.md` decision #11). This
section documents what actually changed; it doesn't repeat the rationale
already recorded in that spec.

**Migrations** — seven new files, one focused change each, following the
same convention as §4:

| Migration | What it does |
|---|---|
| `V7__create_domain_table.sql` | Creates `domain`, seeds a single `imdb` row |
| `V8__add_domain_to_resource_category.sql` | Adds `domain_id`, backfills to `imdb`, replaces the global `UNIQUE (name)` with `UNIQUE (domain_id, name)` + `UNIQUE (id, domain_id)` |
| `V9__add_domain_to_post_type.sql` | Same shape as V8, for `post_type` |
| `V10__add_domain_to_app_user.sql` | Adds `domain_id`, backfills, replaces global username/email uniques with per-domain ones + `UNIQUE (id, domain_id)` |
| `V11__add_domain_to_resource.sql` | Adds a **derived** `domain_id` backfilled from `category_id`, composite FK to `resource_category (id, domain_id)`, per-domain `UNIQUE (domain_id, name)` + `UNIQUE (id, domain_id)` |
| `V12__add_domain_to_post.sql` | Adds a **derived** `domain_id` backfilled from `resource_id`, composite FKs to `resource (id, domain_id)` and `app_user (id, domain_id)`, `UNIQUE (id, domain_id)` |
| `V13__add_domain_to_post_flag.sql` | Adds a **derived** `domain_id` backfilled from `post_id`, composite FKs to `post (id, domain_id)` and `post_type (id, domain_id)` |

Every backfill runs safely as a `NOT NULL`-from-the-start migration (add
column → backfill → set `NOT NULL` → add constraints) since exactly one
domain (`imdb`) exists and every pre-existing row belongs to it.

**New classes**, following the existing per-aggregate pattern (§3/§5/§6/§10):
`entity.Domain`, `repository.DomainRepository` (`findByName`),
`dto.domain.DomainResponse`, `mapper.DomainMapper`, `service.DomainService`
(`listAll`, `get`, and `requireByName` — the shared header-resolution
helper every other service calls), `web.DomainController` (the only
controller that doesn't require the header, per §8).

**Entities**: `ResourceCategory`, `PostType`, and `AppUser` each gained a
plain `domainId` field. `Resource`, `Post`, and `PostFlag` also gained a
plain `domainId` field, but it's documented in each entity as derived —
the service layer sets it from the parent row being referenced, never from
client input.

**Repositories**: every `findByName`/`findByUsername`/`findByEmail`-style
lookup on a directly domain-owned table became domain-scoped
(`findByDomainIdAndName`, `findByDomainIdAndUsername`, ...), and every
`findById...`/`findAll...` gained a `domainId` parameter
(`findByIdAndDomainId`, `findAllByDomainId`, ...) so a caller in one domain
can't read another domain's rows by guessing an id. `PostFlagRepository`'s
native upsert query (§6) gained a `domainId` bind parameter, written only
on insert — `ON CONFLICT DO UPDATE` never touches it.

**Services**: every public method on `ResourceCategoryService`,
`PostTypeService`, `AppUserService`, `ResourceService`, `PostService`, and
`PostFlagService` gained a `String domain` parameter, resolved to a
`domainId` via `DomainService.requireByName` as the method's first step.
Two extra checks worth calling out because they aren't just "add a
domainId column and filter by it":

- `ResourceService.create` looks up the category via
  `findByIdAndDomainId` (not `getReferenceById`, which was the previous
  implementation) — the lookup itself is what proves the category belongs
  to the caller's domain before `resource.domainId` is set from it.
- `PostService.createTopLevelPost`/`createReply` (the two endpoints that
  take a raw `userId` instead of resolving one by username) explicitly
  verify that user belongs to the resolved domain via
  `AppUserRepository.findByIdAndDomainId` before using it. The unified
  `createPost` entry point gets this for free, since its
  `findByDomainIdAndUsername` lookup can't return a user from another
  domain in the first place.

**Controllers**: every controller method gained
`@RequestHeader("X-Domain") String domain`, except `DomainController`
itself. A missing header produces Spring's default `400` for a missing
required header; an unrecognized domain value produces the existing
`EntityNotFoundException` → `404` path (§11) — no new exception type or
`GlobalExceptionHandler` case was needed for either.

**Testing**: `PostServiceTest` mocks `DomainService` and stubs
`requireByName`; `PostFlagRepositoryTest` resolves the seeded `imdb`
domain via `DomainRepository` in its `@BeforeEach` and threads `domainId`
through the entities it builds; `ResourceControllerTest` adds
`.header("X-Domain", "imdb")` to every `MockMvc` call;
`PostsFlowIntegrationTest` adds the header once via a `ClientHttpRequestInterceptor`
on its `TestRestTemplate` rather than threading it through every call. All
13 migrations run cleanly against a fresh Testcontainers Postgres as part
of this suite.

## 18. Addendum: Neutral Severity Score (0)

`post_flag.score` widened from **1–5** to **0–5** (design-spec.md decision
#12). `0` is not "no flag" — it's an explicit "I looked at this post for
this category and found it a non-issue" data point, distinct from simply
never creating a `post_flag` row for that `post_type` at all.

- **Migration**: `V15__widen_post_flag_score_range.sql` — drops and
  re-adds `chk_post_flag_score` as `CHECK (score BETWEEN 0 AND 5)`. A
  simple constraint swap, no backfill needed (no existing row becomes
  invalid by widening a range).
- **DTOs**: `PostFlagCreateRequest.score` and `PostCreateRequest.score`
  both changed from `@Min(1)` to `@Min(0)` (§9, §16).
- **No service-layer changes needed**: `PostService.createPost`'s
  "postTypeId and score must be provided together" check already used
  `== null`, not a truthiness check — `0` was already handled correctly
  as "score provided," so this was purely a validation-boundary change.
- **Rankings** (§17, `GET /rankings`): unaffected structurally — a
  resource's average score naturally drops when neutral flags are mixed
  in with severity-scored ones, which is the intended effect, not a bug
  to guard against.

## Appendix A: Running the Application Locally

### Prerequisites

- **Java 25.** Point `JAVA_HOME` at a Java 25 JDK before running Maven —
  on this machine that's:
  ```bash
  export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-25.jdk/Contents/Home
  ```
  (`java -version` in a plain shell may resolve to Java 25 already, but
  `JAVA_HOME`/`./mvnw` can still point at an older JDK installed
  separately — check with `mvn -v` if you hit a
  `release version 25 not supported` build error.)
- **PostgreSQL**, reachable at `localhost:5432`, with:
  - a database named `posts-db`
  - a `posts` schema inside it (Flyway will create the schema itself on
    first run via `spring.flyway.create-schemas=true` — you only need the
    database to exist)
  - a `postgres` role able to connect to it
- **Docker**, running, if you want to execute the Testcontainers-backed
  tests (repository/integration layers in §14). Unit and `@WebMvcTest`
  tests don't need it.

Connection details are configured in
`src/main/resources/application.yml`:

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/posts-db
    username: postgres
    password: "P@55w0rd"
    hikari:
      schema: posts
```

`spring.datasource.hikari.schema` (rather than a `?currentSchema=posts`
query param on the URL) is what makes unqualified table references — the
native `@Modifying` queries in `PostRepository`/`PostFlagRepository` — and
Hibernate's own DDL/DML resolve against the `posts` schema. A URL param
would work for the running app but gets silently dropped by
Testcontainers' `@ServiceConnection` in tests, which builds its own JDBC
URL; the Hikari property applies uniformly in both cases. If your local
Postgres uses different credentials, update these four lines (and the
matching `@DynamicPropertySource` overrides in the Testcontainers-based
test classes stay database-agnostic and don't need changes).

### Starting Postgres

If Postgres isn't already running:

```bash
# Homebrew install:
brew services start postgresql@18   # or your installed version

# Then, one-time setup if posts-db doesn't exist yet:
createdb posts-db
```

The `posts` schema and all tables are created automatically by Flyway
the first time the app starts — no manual DDL needed.

### Running the app

From `posts/`:

```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-25.jdk/Contents/Home
./mvnw spring-boot:run
```

On success you'll see Flyway apply all thirteen migrations followed by
`Started PostsApplication in N seconds`, and the app listens on
`http://localhost:8080`.

- **Swagger UI:** http://localhost:8080/swagger-ui.html
- **OpenAPI JSON:** http://localhost:8080/v3/api-docs

A `Using generated security password: ...` line in the startup log is
expected and harmless — it comes from Spring Security's default
autoconfiguration and is unused, since `SecurityConfig` (§12) permits every
request while auth remains unbuilt.

### Building and testing

```bash
./mvnw clean install        # build, then run the full test suite (needs Docker for Testcontainers tests)
./mvnw test                 # tests only
./mvnw test -Dtest=PostServiceTest             # a single unit test (no Docker needed)
./mvnw test -Dtest=ResourceControllerTest      # a single @WebMvcTest (no Docker needed)
./mvnw test -Dtest=PostFlagRepositoryTest      # @DataJpaTest + Testcontainers (needs Docker)
./mvnw test -Dtest=PostsFlowIntegrationTest    # full happy-path flow (needs Docker)
```

## Appendix B: Adding Users, Resources, and Posts

These examples assume the app is running on `http://localhost:8080` and use
`curl`. Response bodies are abbreviated for readability. Every request
below except the two `/domains` lookups carries `-H "X-Domain: imdb"`
(§17) — a missing or unrecognized value returns `400`/`404` respectively.

### 1. Create a user (dev-only, §8)

There's no real registration flow yet, so test users come from the
temporary `/dev/users` endpoint:

```bash
curl -X POST http://localhost:8080/dev/users \
  -H "Content-Type: application/json" -H "X-Domain: imdb" \
  -d '{"username":"jdoe","email":"jdoe@example.com","firstName":"Jane","lastName":"Doe"}'
```

```json
{"id":1,"username":"jdoe","email":"jdoe@example.com", "...": "..."}
```

Note the returned `id` — every write below needs a `userId` since there's
no authenticated principal to derive it from yet (§8).

### 2. Look up a resource category

Categories are seeded from IMDB's `titleType` values (§4, `V2__seed_lookup_tables.sql`)
— you don't create these, just pick one:

```bash
curl http://localhost:8080/resource-categories -H "X-Domain: imdb"
```

```json
[{"id":1,"name":"movie","displayName":"Movie"}, "..."]
```

### 3. Create a resource

```bash
curl -X POST http://localhost:8080/resources \
  -H "Content-Type: application/json" -H "X-Domain: imdb" \
  -d '{"name":"tt0111161","displayName":"The Shawshank Redemption","categoryId":1}'
```

```json
{"id":1,"name":"tt0111161","displayName":"The Shawshank Redemption","category":{"id":1,"name":"movie","displayName":"Movie"}, "...": "..."}
```

`name` must be unique — a repeat returns `409 Conflict`.

### 4. Create a top-level post on that resource

```bash
curl -X POST http://localhost:8080/resources/1/posts \
  -H "Content-Type: application/json" -H "X-Domain: imdb" \
  -d '{"userId":1,"bodyText":"This scene handles its subject matter poorly."}'
```

```json
{"id":1,"resourceId":1,"userId":1,"parentPostId":null,"bodyText":"This scene handles its subject matter poorly.", "...": "..."}
```

### 5. Reply to a post

The resource is derived server-side from the parent post — you don't (and
can't) pass one:

```bash
curl -X POST http://localhost:8080/posts/1/replies \
  -H "Content-Type: application/json" -H "X-Domain: imdb" \
  -d '{"userId":1,"bodyText":"I agree, worth flagging."}'
```

### 5b. Or: create a post (top-level or reply) via the unified endpoint (§16)

Same effect as steps 4/5, but identifies the author by `username` and
takes an optional `parentPostId` instead of two different URLs:

```bash
# top-level
curl -X POST http://localhost:8080/posts \
  -H "Content-Type: application/json" -H "X-Domain: imdb" \
  -d '{"username":"jdoe","resourceId":1,"bodyText":"This scene handles its subject matter poorly."}'

# reply — resourceId is still required in the body but is ignored/derived from the parent
curl -X POST http://localhost:8080/posts \
  -H "Content-Type: application/json" -H "X-Domain: imdb" \
  -d '{"username":"jdoe","resourceId":1,"parentPostId":1,"bodyText":"I agree, worth flagging."}'

# post + flag in one call (postTypeId and score must be given together)
curl -X POST http://localhost:8080/posts \
  -H "Content-Type: application/json" -H "X-Domain: imdb" \
  -d '{"username":"jdoe","resourceId":1,"bodyText":"This is a problem.","postTypeId":1,"score":4}'
```

```json
{"post":{"id":1,"resourceId":1,"userId":1,"parentPostId":null,"bodyText":"...", "...": "..."},"flag":{"id":1,"postId":1,"postType":{"id":1,"name":"racism"},"score":4, "...": "..."}}
```

`flag` is `null` when `postTypeId`/`score` weren't provided.

### 6. Flag a post

```bash
curl -X POST http://localhost:8080/posts/1/flags \
  -H "Content-Type: application/json" -H "X-Domain: imdb" \
  -d '{"userId":1,"postTypeId":1,"score":3}'
```

Posting again with the same `postTypeId` upserts the score in place rather
than creating a duplicate row (§7).

### 7. Edit or delete a post

Ownership is enforced against the `userId` supplied in the request — a
mismatch returns `403 Forbidden`:

```bash
# edit
curl -X PATCH http://localhost:8080/posts/1 \
  -H "Content-Type: application/json" -H "X-Domain: imdb" \
  -d '{"userId":1,"bodyText":"Edited text."}'

# delete (no body — acting user goes in a header; cascades to the reply subtree)
curl -X DELETE http://localhost:8080/posts/1 -H "X-User-Id: 1" -H "X-Domain: imdb"
```

Removing a flag follows the same header pattern:

```bash
curl -X DELETE http://localhost:8080/posts/1/flags/1 -H "X-User-Id: 1" -H "X-Domain: imdb"
```

### Reminder

None of the `userId`/`X-User-Id` values above are security-enforced (§8) —
anyone can currently claim any user ID. That's intentional for this phase
and goes away once real auth (design-spec.md §6) lands.

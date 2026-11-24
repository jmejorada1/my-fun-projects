---
paths:
  - "backend/posts/src/main/java/**"
---

# posts API: SOLID

Apply these where they pay off. KISS still wins (see the root
[Design principles](../../CLAUDE.md#design-principles)): don't add a
class, interface or layer just to satisfy a principle.

- **Single responsibility.** Controllers in `web/` only translate HTTP:
  each calls its service and never touches a repository, an entity or a
  business rule. Business rules live in `service/`. Split a service you
  can't describe without "and".
- **Open/closed.** Adding a domain adds a migration, not code (see
  [Adding a new domain](../../backend/posts/CLAUDE.md#adding-a-new-domain)).
  Never `if`/`switch` on a domain key or post-type name: what differs
  between domains lives in the rows that migration inserts.
- **Liskov.** Extend or implement only framework types: exceptions and
  Spring extension points such as `ResponseEntityExceptionHandler` and
  `HandlerMethodArgumentResolver`. An override keeps the parent's
  contract: it returns what callers expect and never throws
  `UnsupportedOperationException`. Share code through a service or
  helper, not a base class.
- **Interface segregation.** Request DTOs are per operation
  (`PostCreateRequest`, `PostUpdateRequest`) and carry only the fields
  that operation accepts. Never reuse a response DTO as a request. An
  interface for an external client declares only the calls this app
  makes.
- **Dependency inversion: inject, don't create.** Constructor injection
  only: `private final` fields with Lombok `@RequiredArgsConstructor`. No
  field `@Autowired`, no mutable `static` fields, and never `new` up a
  service or client. Inject a `Clock` or random source where behavior
  depends on one.
- **Dependency inversion: interfaces at real seams only.** Depend on the
  interface types that already exist: Spring Data repositories,
  MapStruct mappers, and `List`/`Map`/`Set` rather than concrete
  collections. Services are concrete `@Service` classes: no
  `FooService`/`FooServiceImpl` pair. Add an interface only for a second
  implementation or an external client to stub in tests. Mockito mocks
  concrete classes, so testability isn't a reason to add one.

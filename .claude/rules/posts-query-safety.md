---
paths:
  - "backend/posts/src/main/java/**"
---

# posts API: input validation, queries, domain scoping

- **Validate input at the boundary.** Put Bean Validation annotations on
  request DTOs, and `@Valid @RequestBody` on the controller parameter
  (see `PostController`).
- **Bind every query parameter.** Use Spring Data derived methods, or
  named parameters (`:name`) in `@Query`, for both JPQL and native SQL.
  Never concatenate request data into a query string.
- **Scope every query to the request's domain.** A handler that touches
  domain-scoped data takes `@CurrentDomain DomainRef domain`. Don't read
  the `X-Domain` header yourself. Pass the `DomainRef` down, and filter
  every new query on `domain.id()`. A lookup by id must not return a row
  from another domain: it is a `NotFoundException`, as in
  `PostTypeService.get` (`findByIdAndDomainId`).

---
paths:
  - "backend/posts/src/main/resources/db/migration/**"
---

# Flyway migrations (posts API)

- **Put every schema change in a new migration.** Name it
  `V<next>__<description>.sql`, where `<next>` is one more than the
  highest existing version. Use `ls | sort -V` to find it, because
  `V18` sorts before `V5` alphabetically.
- **Never edit, rename or delete an applied migration.** Flyway's
  checksum validation fails on startup, and databases that already ran
  the old version drift away from the new code.
- To add a domain, follow
  [Adding a new domain](../../backend/posts/CLAUDE.md#adding-a-new-domain).

# CLAUDE.md — Angular UI

Docs: [architecture](docs/architecture.md) (code structure),
[design-spec](docs/design-spec.md) (screens, flows, business rules),
[running-locally](docs/running-locally.md) (backend setup),
[user-guide](docs/user-guide.md).

## Commands

```bash
ng serve
ng build
ng test [--watch=false] [--include=<spec-file>] [--coverage]
```

There are no `lint` or `e2e` targets. The test runner is **Vitest**
(`@angular/build:unit-test`), so specs use `vi.fn()`/`vi.spyOn()`/
`vi.useFakeTimers()`, not Jasmine.

## Code style

- Strict TypeScript (`noImplicitAny`). Standalone components/directives/
  pipes, no NgModules. `ChangeDetectionStrategy.OnPush` everywhere.
- Signals for state, RxJS for async streams. Unsubscribe with
  `takeUntilDestroyed` or the `async` pipe. No nested subscribes.
- Keep logic out of templates; use computed signals or component methods.
- Handle HTTP errors with user-facing feedback. No empty catch blocks.

## Domain configuration (`core/domain/`)

Each domain's behavior (rating mode, badge colors, skin tokens,
business-rule hooks such as bigotry's no-bigotry conflict dialog) lives
in one `DomainConfig` under `core/domain/configs/`, registered in
`domain-registry.ts`. `domain-options.ts` is derived from the registry.
Components read `DomainSelectionService.activeDomainConfig()` and never
import domain constants directly. Adding a domain means one config file
and one registry line
([details](docs/architecture.md#4-domain-configuration-system)).

## Runtime API URL

Every `api/*.service.ts` reads `ApiConfigService.baseUrl()`
(`core/api-config.ts`), never a hardcoded URL. At container startup,
`docker-entrypoint.sh` writes `/config.json` from `API_BASE_URL`. A
`provideAppInitializer` in `app.config.ts` loads it, so one image can
serve any backend. In tests the initializer doesn't run, so `baseUrl()`
returns the `API_BASE_URL` constant's default and specs need no setup.

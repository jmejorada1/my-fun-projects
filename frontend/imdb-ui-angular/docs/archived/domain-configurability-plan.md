# Domain Configurability Plan — Angular UI

Status: Draft — planning only, nothing in this doc has been implemented.
Source: `TODO.txt` — "restructure code to be easily configurable by domain,"
using `imdb/standard` (skip it / it was okay / I enjoyed it / I loved it,
counts only, no severity average) as the driving example, plus a
domain-specific UI skin.

## 1. Goal

Today the Angular app has exactly one fully-realized domain, `imdb/bigotry`
("Big-O-Meter"). `imdb/standard` ("Movie-Meter") is a reserved, disabled slot
in the domain picker with no real behavior behind it
([`domain-options.ts`](../src/app/core/domain-options.ts)). The goal is to
turn "add a new domain" into a single new config file (§5–§6) — rather than
a code change scattered across five feature components and three shared
files.

This doc plans that restructuring for the Angular code specifically (per the
request), and separately calls out §9, a real dependency this plan has on
the backend that shouldn't be glossed over.

## 2. Current State (what's already domain-aware)

More of this already exists than the TODO implies:

- **Domain selection is already a real, working seam.** `DOMAIN_OPTIONS`
  ([`domain-options.ts`](../src/app/core/domain-options.ts)),
  `DomainSelectionService`, and `domain-header.interceptor.ts` already
  parameterize *which* domain every request targets, persist the choice,
  and reject stale sessions on switch.
- **Post types are already server-driven, not hardcoded.** `PostTypeService.listAll()`
  hits `GET /post-types` and the resource-detail form renders whatever comes
  back. Adding "skip it" / "it was okay" / etc. as `post_type` rows under a
  new domain requires zero frontend code change to *populate* the dropdown.
- **The search panel's flag-summary columns are already dynamic.**
  [`search-panel.component.ts`](../src/app/features/dashboard/search-panel.component.ts)'s
  `flagCategories` is derived from whatever category names show up in the
  results, not a fixed list.
- **Theming is already token-based.** [`styles.css`](../src/styles.css)
  drives the whole app off `:root` CSS custom properties (`--color-primary`,
  `--color-severity-*`, spacing/radius/shadow scales) — no component embeds
  a raw hex value. That's most of the plumbing a per-domain skin needs
  already in place.

## 3. What's still hardcoded to `imdb/bigotry`

This is the actual gap — business rules and UI structure, not data:

| File | What's baked in |
|---|---|
| [`core/post-type.constants.ts`](../src/app/core/post-type.constants.ts) | `NO_BIGOTRY_TYPE_NAME`, `SEVERE_SCORE_THRESHOLD`, `flagSeverityClass()` — a global severity→color function assuming every domain has a 0–5 severity scale and a "no bigotry" neutral category. |
| [`features/resource-detail/resource-detail.component.ts`](../src/app/features/resource-detail/resource-detail.component.ts) | The post form always renders a required 0–5 `score` field; an `effect()` locks it to 0 and hides it only for the one magic `NO_BIGOTRY_TYPE_NAME` category; a whole conflict-detection dialog (`checkForConflictingPosts`, `keepPreviousFlags`, `confirmRemoveConflictingPosts`) exists purely to reconcile "no-bigotry" vs. severity-flagged posts — a bigotry-domain-specific notion of contradiction; `comparePostsBy('category')` sorts by `.score`. |
| [`features/dashboard/rankings-panel.component.ts`](../src/app/features/dashboard/rankings-panel.component.ts) | `withoutSeverelyFlaggedNoBigotryEntries()` — client-side filtering that only makes sense if "no bigotry" and "severity ≥ 3" are meaningful concepts for this domain. |
| Rankings/search/resource-detail templates | All render `averageScore` via `DecimalPipe` as *the* metric — there's no "counts only" display mode. |

Everything in this table is reachable only through direct imports of
`post-type.constants.ts`'s bigotry-specific exports, or literal string
comparisons — there's no seam to swap in different behavior per domain.

## 4. Worked example: `imdb/standard`

Categories: `skip-it`, `it-was-okay`, `i-enjoyed-it`, `i-loved-it`. No
severity — "just counts of the above chosen categories."

Mapped onto the existing backend shape (see §9), this domain needs:

- The post form to show **only** a category picker — no `score` input at
  all, not even a hidden/disabled one.
- Rankings and the resource's flag summary to render as **counts** ("142
  people loved it"), not `averageScore.toFixed(1)`.
- Badge/summary coloring by *category identity* (e.g. grey → blue → teal →
  gold for skip→loved), not by a severity number.
- No conflict dialog — there's no bigotry-style "these two flags contradict
  each other" rule for a single rating category.
- A distinct visual skin (see §8).

## 5. Proposed model: `DomainConfig`

**Design constraint (confirmed, §12):** adding a domain should touch the
*minimum* number of files and the minimum new code/text. That rules out
spreading one domain's definition across `domain-options.ts` (picker),
`domain-registry.ts` (behavior), and `styles.css` (skin) — three files for
one concept. Instead, `DomainConfig` absorbs all of it: picker metadata,
rating behavior, and theme tokens live in one object, in one file, per
domain. `domain-options.ts` and the hand-authored `:root[data-theme=...]`
blocks in `styles.css` both go away, derived/generated instead of
hand-maintained.

```ts
// core/domain/domain-config.model.ts

export type RatingMode = 'severity-score' | 'category-only';

export interface DomainConfig {
  /** The X-Domain header value / picker key, e.g. 'imdb/standard'. */
  value: string;
  /** Picker label + login/register copy — replaces DomainOption. */
  label: string;
  description: string;
  enabled: boolean;

  rating: {
    mode: RatingMode;
    /** 'severity-score' only: the score field's range and the threshold
     *  used for any "severe" business rule. */
    severity?: { min: number; max: number; severeThreshold: number };
    /** Fixed score sent to the backend for every flag when mode is
     *  'category-only' (see §9 — the schema still requires a score). */
    fixedScoreValue?: number;
  };

  /** postType.name -> CSS class/token, replaces flagSeverityClass(). */
  badgeClassFor(postTypeName: string, score: number): string;

  /** postType.name that's exempt from whatever "severe" filtering rules
   *  this domain defines, or null if the domain has no such concept. */
  neutralPostTypeName: string | null;

  /**
   * Optional, domain-specific cross-post business rule (bigotry's
   * no-bigotry-vs-severity conflict dialog). Most domains omit this.
   */
  findConflictingPosts?(posts: Post[], userId: number, excludePostId: number, newFlag: PostFlag): Post[];

  /** Ranking/list-level filter hook — bigotry's withoutSeverelyFlaggedNoBigotryEntries(). */
  postProcessRankings?(rankings: PostTypeRanking[]): Observable<PostTypeRanking[]>;

  /**
   * CSS custom-property overrides applied to :root while this domain is
   * active — the domain's entire skin. Only the tokens this domain wants
   * to change need appear here; anything omitted falls back to styles.css's
   * base :root values (bigotry's today). See §8 — no styles.css edit
   * needed to add a domain.
   */
  themeTokens: Record<string, string>;
}
```

Every field a new domain needs to set lives in this one interface — a new
domain is one new file implementing it, not edits spread across three.

## 6. Proposed file layout

```
core/domain/
  domain-config.model.ts        # DomainConfig interface (§5)
  domain-registry.ts            # DOMAIN_REGISTRY: DomainConfig[] — the one array every config is added to
  configs/
    imdb-bigotry.config.ts      # today's behavior + picker copy + today's theme, moved here verbatim
    imdb-standard.config.ts     # the new domain — everything it needs, in this one file
core/domain-selection.service.ts
  + readonly activeDomainConfig = computed(() =>
      DOMAIN_REGISTRY.find(c => c.value === this.selectedDomain())!)
  + effect(...) applying activeDomainConfig().themeTokens to :root — see §8
core/post-type.constants.ts     # deleted; its contents move into imdb-bigotry.config.ts
core/domain-options.ts          # deleted; DOMAIN_OPTIONS_TOKEN's factory becomes
                                 # `() => DOMAIN_REGISTRY.map(({value,label,description,enabled}) => ({value,label,description,enabled}))`
                                 # so app-toolbar.component.ts / register.component.ts need no changes —
                                 # they still consume the same DomainOption shape, just derived now
```

`imdb-bigotry.config.ts` is where `NO_BIGOTRY_TYPE_NAME`,
`SEVERE_SCORE_THRESHOLD`, `flagSeverityClass`,
`withoutSeverelyFlaggedNoBigotryEntries`, the conflict-dialog logic, and
today's `:root` color values all end up — moved, not rewritten, since that
behavior is correct for bigotry and shouldn't change.

**Adding a domain, end to end, becomes:** write `imdb-standard.config.ts`
(one file — data + the handful of hooks it actually needs + its theme
tokens), add it to the `DOMAIN_REGISTRY` array (one line in
`domain-registry.ts`), flip `enabled: true` once backend data exists. No
other file changes required for a `category-only` domain with no conflict
rule (which covers `imdb/standard`).

## 7. Component-by-component changes

- **`resource-detail.component.ts`**: inject `activeDomainConfig`. The
  `score` `FormControl` and its validators, the "no-bigotry locks score to
  0" `effect()`, and the whole conflict-dialog flow (`checkForConflictingPosts`
  and friends) become conditional on `rating.mode === 'severity-score'` /
  `findConflictingPosts` being present, rather than on `isNoBigotrySelected()`
  checking a magic string. `submit()`/`submitReply()` send
  `rating.fixedScoreValue` instead of the form's `score` when in
  `category-only` mode. `comparePostsBy('category')` needs a mode-aware
  comparator (falls back to post-type name only when there's no score).
- **`rankings-panel.component.ts`**: `withoutSeverelyFlaggedNoBigotryEntries`
  moves behind `activeDomainConfig().postProcessRankings?.(rankings) ?? of(rankings)`.
- **Templates (rankings-panel, search-panel, resource-detail)**: the
  `DecimalPipe`-on-`averageScore` cells become an `@switch` on
  `activeDomainConfig().rating.mode` — `severity-score` keeps today's
  markup, `category-only` renders `entry.count` with a label instead.
- **`post-type.constants.ts`** callers (`flagSeverityClass` in
  `search-panel.component.ts` and `resource-detail.component.ts`): replaced
  with `activeDomainConfig().badgeClassFor(...)`.

Everywhere else (search, auth, dashboard shell, my-posts-panel) is already
domain-agnostic and needs no changes.

## 8. Theming / "skin" per domain

Reuse the CSS-custom-property structure already in `styles.css`, but apply
a domain's overrides at runtime from its `themeTokens` map (§5) instead of
hand-authoring a `:root[data-theme=...]` block per domain in `styles.css` —
that keeps a domain's skin inside its one config file rather than a second
file every new domain has to remember to edit:

```ts
// core/domain-selection.service.ts
private previouslyAppliedTokenKeys: string[] = [];

private applyTheme(config: DomainConfig): void {
  const root = document.documentElement.style;
  for (const key of this.previouslyAppliedTokenKeys) {
    root.removeProperty(key); // fall back to styles.css's base :root value
  }
  for (const [key, value] of Object.entries(config.themeTokens)) {
    root.setProperty(key, value);
  }
  this.previouslyAppliedTokenKeys = Object.keys(config.themeTokens);
}
```

`styles.css`'s existing `:root { ... }` block stays exactly as-is and acts
as the base/default (bigotry's values, since bigotry is the default
domain) — a new domain's `themeTokens` only needs to list the properties it
actually wants to change (e.g. `--color-primary`, `--color-primary-hover`,
new badge tokens for skip/okay/enjoyed/loved), not restate the whole
palette. The clear-then-apply step above avoids one domain's overrides
bleeding into the next when switching between two non-default domains
directly. No lazy-loaded stylesheets, no per-domain component variants —
same DOM structure, different token values, consistent with how the app
already only has one stylesheet (`angular.json`'s `styles` array).

If a domain someday needs actual *structural* layout differences (not just
color/spacing), that's a bigger step up (per-domain component overrides)
and isn't needed for the `imdb/standard` example as specified.

This also covers the existing domain-switch-mid-session flow "for free":
`DomainSelectionService.select()` already logs the user out and redirects
to `/login` when the domain changes underneath an active session (accounts
are domain-scoped — see its code comment). Because the theme-applying
`effect()` above reacts to the same `selectedDomain()` signal `select()`
updates, the token swap fires before/alongside that redirect — the `/login`
page the user lands on already renders in the newly-selected domain's skin,
not a flash of the old one, with no extra wiring needed.

## 9. Backend touchpoint — read before starting

This plan is scoped to the Angular app, as asked, but one piece of "no
severity to average, just counts" genuinely reaches past the frontend, and
it's worth being explicit about it rather than quietly assuming an answer:

`post_flag.score` is `NOT NULL smallint CHECK (0–5)` and `/rankings` /
`/resources` both compute `AVG(pf.score)` unconditionally
([`PostFlagRepository.java`](../../../backend/posts/src/main/java/com/jp/projects/posts/repository/PostFlagRepository.java)).
There's no backend notion of a domain that doesn't score.

Two ways to reconcile that with `imdb/standard`:

1. **No backend query/schema change** (what this plan assumes — the seed
   migration in Phase 2b's step 1 is still required either way, since it's
   data, not query logic): the frontend always
   submits `rating.fixedScoreValue` (e.g. `0`) for every flag in a
   `category-only` domain, and simply never displays `averageScore` for it.
   Ranking order still comes out correct "for free" — with every score
   equal, `PostFlagRepository`'s `ORDER BY avg_score DESC, flag_count DESC`
   degrades to ranking by count, which is exactly "counts of the chosen
   categories." `flagSummary.flagCount` (already returned per category
   today) is all the UI needs.
2. **Backend change**: make `post_flag.score` nullable / add a
   `post_type.scored boolean` flag, and stop computing `AVG` for unscored
   types. More correct in spirit, more work, touches Flyway migrations and
   `design-spec.md`'s decision log.

Recommendation: start with (1) — it needs no backend *query/schema* work
(beyond the seed migration everything needs regardless) and the ranking
behavior comes out right by construction. But `backend/posts/CLAUDE.md`
explicitly asks that non-obvious modeling choices like "this domain's score
column is a meaningless constant" be recorded as a decision, not silently
assumed — so before implementing, add that decision to
`backend/posts/docs/design-spec.md`'s decision log (or confirm it isn't
wanted) rather than having it only live in this Angular-side doc.

## 10. Separate Angular (or React) project instead?

Not recommended. A second frontend project would duplicate the ~80% that
doesn't vary by domain — auth, routing, the dashboard shell, search, the
API client layer, resource-detail's threading/reply/highlight/column-resize
machinery — to isolate the ~20% that does (post-type semantics, rating
display, skin). §5–§8 give that 20% a real seam without forking the app.

A separate project would only start to make sense if a domain needs a
genuinely different *navigation structure or UX*, not just different
categories/skin — or if it needs independent ownership/deploy cadence
(different team, different release schedule). Neither applies to
`imdb/standard` as specified.

## 11. Suggested phasing

1. **Scaffolding, no behavior change.** Introduce `DomainConfig`,
   `domain-registry.ts`, move bigotry's existing logic into
   `imdb-bigotry.config.ts` verbatim, wire components to read from
   `activeDomainConfig()` instead of the constants file. Bigotry domain's
   behavior/output should be pixel- and logic-identical before/after.
   - **How to verify**: `ng test` — the existing
     `resource-detail.component.spec.ts` and
     `rankings-panel.component.spec.ts` already exercise today's bigotry
     behavior (score validators, no-bigotry lock, severity filtering).
     They're the regression gate for "identical behavior": zero unexpected
     diffs to their assertions is the pass condition for this phase, not a
     new test suite.

2a. **`imdb/standard` config + component-level UI — no backend dependency.**
    Write `imdb-standard.config.ts` (`category-only` rating mode, counts
    rendering, badge coloring, skin tokens — §6) and add it to
    `DOMAIN_REGISTRY`. This step doesn't require real seeded backend data;
    tests exercise it by pointing `DomainSelectionService`/`activeDomainConfig`
    at the new config directly.
    - **How to verify**: new unit tests for `imdb-standard.config.ts`
      (`badgeClassFor`, `rating.fixedScoreValue`), plus component specs for
      `resource-detail`/`rankings-panel`/`search-panel` asserting the
      `category-only` path — score field absent, submit sends
      `fixedScoreValue`, counts render instead of `DecimalPipe` averages.
      All runnable via `ng test`, no backend involved.

2b. **Seed the backend and verify end-to-end.** This step's seeding work is
    independent of §9's option 1 vs. 2 — it's needed either way, since it's
    the domain/category/post-type rows, not the score-column decision.
    Follows the exact pattern `V14__seed_imdb_bigotry_domain.sql` and
    `V16__seed_no_bigotry_post_type.sql` already established:
    1. **New Flyway migration**, e.g.
       `V17__seed_imdb_standard_domain.sql`: insert the `domain` row
       (`imdb/standard`), the same ten `resource_category` rows bigotry's
       migration seeds (movie/short/tvSeries/.../videoGame — categories are
       per-domain, so `imdb/standard` needs its own copies, not shared
       rows), and the four `post_type` rows (`skip-it`, `it-was-okay`,
       `i-enjoyed-it`, `i-loved-it`), all scoped to the new domain's id —
       same `ON CONFLICT DO NOTHING` idempotency as the existing seeds.
    2. **Import resources**: no new loader needed —
       [`imdb-loader`](backend/imdb-data-python/import_resources.py) already
       takes `--domain` as a CLI flag (README's "Loading IMDB data"
       section); once step 1's `resource_category` rows exist, run
       `docker compose run --rm imdb-loader --domain imdb/standard` the
       same way `./scripts/docker-load-bigotry-data.sh` does for bigotry.
       (`bigotry-loader`'s synthetic posts/flags are bigotry-specific and
       don't need an equivalent here — step 3 below covers real posts
       manually.)
    3. Flip `imdb-standard.config.ts`'s `enabled: true`, run the full stack
       via docker-compose, and manually exercise: submit a rating, confirm
       it shows up as a count in rankings/search, confirm the skin's tokens
       are applied.
    - **How to verify**: `./mvnw test` picks up the new migration via
      Testcontainers as part of the normal suite (same as any other Flyway
      migration); step 3 is a manual run-through in a real browser (per
      this project's guidance to test UI changes against the running app,
      not just unit tests).
    - **Dependency, previously left implicit**: 2a's green tests are not
      "Phase 2 done" — this step is what actually proves the domain works,
      and it can't start before its own migration (sub-step 1) exists,
      which was quietly assumed rather than planned for before this
      revision.

3. **Backend decision** (§9) recorded and, if going with option 2 there,
   implemented.
   - **How to verify**: `./mvnw test` — a repository-level test asserting
     that ranking order degrades correctly to count-based ordering when
     every flag's score is the same constant (option 1), or that unscored
     post types are excluded from `AVG` correctly (option 2); plus hitting
     `GET /rankings` with `X-Domain: imdb/standard` and checking the
     response shape once seed data exists (unblocks 2b above).

## 12. Resolved questions

- **JSON config vs. code, and how many files a new domain touches?**
  Resolved: optimize for minimum files/code touched per domain, not for a
  literal JSON file. `DomainConfig` (§5) is a single TS object per domain —
  static fields (`label`, `rating.mode`, `themeTokens`, etc.) sit alongside
  the handful of behavioral hooks a domain actually needs
  (`findConflictingPosts`, `postProcessRankings`, `badgeClassFor`), in one
  file. This is why §5–§8 above fold picker metadata and theme tokens into
  `DomainConfig` instead of keeping them in separate `domain-options.ts`
  and `styles.css` edits — a plain-JSON config would've required those
  hooks to live somewhere else anyway, which is the opposite of "minimum
  files to touch."
- **Single- vs. multi-select rating for `imdb/standard`?** Resolved:
  single-select, same as bigotry's form today. No change needed to the
  form's one-`postTypeId`-per-submission structure from §4/§7.

import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { PostService } from '../../../api/post.service';
import { PostTypeRanking } from '../../../api/ranking.service';
import { DomainConfig } from '../domain-config.model';

/**
 * "No Bigotry" is a frontend-only concept — the backend's post_type table
 * has no notion of it (design-spec.md keeps post types/rankings
 * domain-agnostic on the server); everything below that treats it
 * specially reads it from this domain's config instead of a magic string.
 */
const NO_BIGOTRY_TYPE_NAME = 'no-bigotry';

/** "No Bigotry" is only meaningful for a movie with nothing flagged this severely or worse. */
const SEVERE_SCORE_THRESHOLD = 3;

/**
 * Color-codes a flag badge/cell by severity — shared by resource-detail's
 * post table and the search panel's flag-summary columns so both use one
 * consistent scheme. "no-bigotry" is always green regardless of score,
 * since its score is always 0 but that means "clean," not "low severity."
 */
function flagSeverityClass(postTypeName: string, score: number): string {
  if (postTypeName === NO_BIGOTRY_TYPE_NAME) {
    return 'flag-badge--green';
  }
  if (score >= 4) {
    return 'flag-badge--red';
  }
  if (score === 3) {
    return 'flag-badge--orange';
  }
  return 'flag-badge--yellow';
}

/**
 * "No Bigotry" should only rank movies with nothing flagged severity >= 3
 * in ANY category — but `/rankings` only returns per-category averages,
 * not individual flag scores, so that can't be decided from its response
 * alone (an average below 3 can still hide an individual flag of 4 or
 * 5). Purely client-side, and without teaching the backend anything
 * about "no-bigotry": fetch each no-bigotry-ranked movie's posts via the
 * existing, generic, domain-agnostic `GET /resources/{id}/posts` and
 * check their flags directly.
 */
function withoutSeverelyFlaggedNoBigotryEntries(
  rankings: PostTypeRanking[],
  postService: PostService,
): Observable<PostTypeRanking[]> {
  const noBigotryRanking = rankings.find((r) => r.postType.name === NO_BIGOTRY_TYPE_NAME);
  if (!noBigotryRanking || noBigotryRanking.resources.length === 0) {
    return of(rankings);
  }

  const severityChecks = noBigotryRanking.resources.map((item) =>
    postService.listTopLevel(item.resource.id, 0, 200).pipe(
      map((page) => ({
        resourceId: item.resource.id,
        hasSevereFlag: page.content.some((post) =>
          post.flags.some((flag) => flag.score >= SEVERE_SCORE_THRESHOLD),
        ),
      })),
      // A flaky check for one movie shouldn't take down the whole panel —
      // fail open (keep it displayed) rather than block on it.
      catchError(() => of({ resourceId: item.resource.id, hasSevereFlag: false })),
    ),
  );

  return forkJoin(severityChecks).pipe(
    map((results) => {
      const severeResourceIds = new Set(
        results.filter((r) => r.hasSevereFlag).map((r) => r.resourceId),
      );
      const filteredResources = noBigotryRanking.resources.filter(
        (item) => !severeResourceIds.has(item.resource.id),
      );
      return rankings
        .map((ranking) =>
          ranking.postType.name === NO_BIGOTRY_TYPE_NAME ? { ...ranking, resources: filteredResources } : ranking,
        )
        // Nothing left to show once every candidate is filtered out —
        // hide the category entirely rather than show an empty "No
        // Bigotry" section with a misleading "no flagged resources" note.
        .filter((ranking) => ranking.postType.name !== NO_BIGOTRY_TYPE_NAME || ranking.resources.length > 0);
    }),
  );
}

export const IMDB_BIGOTRY_CONFIG: DomainConfig = {
  value: 'imdb/bigotry',
  label: 'Big-O-Meter',
  description:
    'Flags movies, TV shows, and other titles for potentially biased content — racism, sexism, and LGBTQ+-phobia — and lets the community rate how severe each flag is.',
  enabled: true,
  rating: {
    mode: 'severity-score',
    severity: { min: 0, max: 5, severeThreshold: SEVERE_SCORE_THRESHOLD },
  },
  badgeClassFor: flagSeverityClass,
  neutralPostTypeName: NO_BIGOTRY_TYPE_NAME,
  postProcessRankings: withoutSeverelyFlaggedNoBigotryEntries,
  // Bigotry's colors ARE styles.css's base :root values — it's the
  // default domain, so it has nothing to override.
  themeTokens: {},
};

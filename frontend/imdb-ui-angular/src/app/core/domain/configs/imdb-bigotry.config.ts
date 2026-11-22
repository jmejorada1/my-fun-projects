import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { PostService } from '../../../api/post.service';
import { PostTypeRanking } from '../../../api/ranking.service';
import { DomainConfig } from '../domain-config.model';

// The backend treats this like any other post type; only the frontend gives it special rules.
const NO_BIGOTRY_TYPE_NAME = 'no-bigotry';

/** "No Bigotry" is only meaningful for a movie with nothing flagged this severely or worse. */
const SEVERE_SCORE_THRESHOLD = 3;

/** "no-bigotry" is always green: its score is 0, meaning clean rather than low severity. */
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
 * Drops movies with any flag at or above the severe threshold from the "No Bigotry" ranking.
 * /rankings only returns averages, which can hide a single severe flag, so each movie's
 * posts are checked here.
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
      // Fail open: keep the movie if its check fails.
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
        // Hide "No Bigotry" entirely once every movie is filtered out.
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
  // The base styles.css tokens are bigotry's.
  themeTokens: {},
};

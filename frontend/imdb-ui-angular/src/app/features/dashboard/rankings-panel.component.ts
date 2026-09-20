import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { forkJoin, map, of, skip, switchMap, catchError } from 'rxjs';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { AppHttpError } from '../../core/error.interceptor';
import { PostActivityService } from '../../core/post-activity.service';
import { NO_BIGOTRY_TYPE_NAME, SEVERE_SCORE_THRESHOLD } from '../../core/post-type.constants';
import { PostTypeRanking, RankingService } from '../../api/ranking.service';
import { PostService } from '../../api/post.service';

/** Right panel — top 5 resources per post type (design-spec.md §3.5, §5). */
@Component({
  selector: 'app-rankings-panel',
  imports: [DecimalPipe],
  templateUrl: './rankings-panel.component.html',
  styleUrl: './rankings-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RankingsPanelComponent {
  private readonly rankingService = inject(RankingService);
  private readonly postService = inject(PostService);
  private readonly postActivity = inject(PostActivityService);
  private readonly destroyRef = inject(DestroyRef);

  readonly rankings = signal<PostTypeRanking[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.load();

    // Refetches whenever a post/reply is created anywhere in the app
    // (resource-detail) — this panel is mounted for the dashboard's whole
    // lifetime (dashboard.component.ts), so a new flagged post would never
    // show up here without this. skip(1): toObservable() immediately
    // replays the signal's current value on subscribe, which would
    // otherwise double up with the initial load() call above.
    toObservable(this.postActivity.changed)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load());
  }

  private load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.rankingService
      .getRankings()
      .pipe(
        switchMap((rankings) => this.withoutSeverelyFlaggedNoBigotryEntries(rankings)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (rankings) => {
          this.rankings.set(rankings);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.errorMessage.set(err instanceof AppHttpError ? err.message : 'Failed to load rankings.');
          this.loading.set(false);
        },
      });
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
  private withoutSeverelyFlaggedNoBigotryEntries(rankings: PostTypeRanking[]) {
    const noBigotryRanking = rankings.find((r) => r.postType.name === NO_BIGOTRY_TYPE_NAME);
    if (!noBigotryRanking || noBigotryRanking.resources.length === 0) {
      return of(rankings);
    }

    const severityChecks = noBigotryRanking.resources.map((item) =>
      this.postService.listTopLevel(item.resource.id, 0, 200).pipe(
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
}

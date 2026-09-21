import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { of, skip, switchMap } from 'rxjs';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { AppHttpError } from '../../core/error.interceptor';
import { PostActivityService } from '../../core/post-activity.service';
import { DomainSelectionService } from '../../core/domain-selection.service';
import { PostTypeRanking, RankingService } from '../../api/ranking.service';
import { PostService } from '../../api/post.service';

/** Right panel — top 5 resources per post type (design-spec.md §3.5, §5). */
@Component({
  selector: 'app-rankings-panel',
  imports: [DecimalPipe, RouterLink],
  templateUrl: './rankings-panel.component.html',
  styleUrl: './rankings-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RankingsPanelComponent {
  private readonly rankingService = inject(RankingService);
  private readonly postService = inject(PostService);
  private readonly postActivity = inject(PostActivityService);
  private readonly domainSelection = inject(DomainSelectionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly rankings = signal<PostTypeRanking[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  /** Whether the active domain has no severity to average — drives the template's avg-vs-count rendering. */
  isCategoryOnly(): boolean {
    return this.domainSelection.activeDomainConfig().rating.mode === 'category-only';
  }

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
        switchMap((rankings) => {
          const postProcess = this.domainSelection.activeDomainConfig().postProcessRankings;
          return postProcess ? postProcess(rankings, this.postService) : of(rankings);
        }),
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
}

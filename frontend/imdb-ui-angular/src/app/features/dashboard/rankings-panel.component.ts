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

  isCategoryOnly(): boolean {
    return this.domainSelection.activeDomainConfig().rating.mode === 'category-only';
  }

  constructor() {
    this.load();

    // The panel stays mounted, so refetch after post activity. skip(1): toObservable()
    // emits the current value at once, which the load() above already covers.
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

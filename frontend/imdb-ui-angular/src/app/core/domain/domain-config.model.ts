import { Observable } from 'rxjs';
import { PostService } from '../../api/post.service';
import { PostTypeRanking } from '../../api/ranking.service';

export type RatingMode = 'severity-score' | 'category-only';

/** A domain's picker metadata, rating behavior and skin. See docs/architecture.md §4. */
export interface DomainConfig {
  /** The X-Domain header value / picker key, e.g. 'imdb/bigotry'. */
  value: string;
  label: string;
  description: string;
  /** False reserves the domain's slot in the picker without making it selectable. */
  enabled: boolean;

  rating: {
    mode: RatingMode;
    /** 'severity-score' only. */
    severity?: { min: number; max: number; severeThreshold: number };
    /** 'category-only' only: sent with every flag, since post_flag.score is NOT NULL (design-spec.md decision #7). */
    fixedScoreValue?: number;
  };

  badgeClassFor(postTypeName: string, score: number): string;

  /** The neutral post type (bigotry's "no-bigotry"), or null if the domain has none. */
  neutralPostTypeName: string | null;

  /** Takes postService as a parameter so configs stay free of DI. */
  postProcessRankings?(rankings: PostTypeRanking[], postService: PostService): Observable<PostTypeRanking[]>;

  /** Overrides for styles.css's base :root tokens while this domain is active. */
  themeTokens: Record<string, string>;
}

import { Observable } from 'rxjs';
import { PostService } from '../../api/post.service';
import { PostTypeRanking } from '../../api/ranking.service';

export type RatingMode = 'severity-score' | 'category-only';

/**
 * Everything about a domain — picker metadata, rating/flagging behavior,
 * and skin — that used to be hardcoded to (or split across
 * domain-options.ts and) `imdb/bigotry`. See
 * docs/architecture.md §4. Adding a domain is one file
 * implementing this interface plus one line in domain-registry.ts; nothing
 * else needs a manual edit (domain-options.ts derives DOMAIN_OPTIONS from
 * the registry, and styles.css needs no per-domain edit — see §8).
 */
export interface DomainConfig {
  /** The X-Domain header value / picker key, e.g. 'imdb/bigotry'. */
  value: string;
  /** Picker label + login/register copy. */
  label: string;
  description: string;
  /** False reserves the domain's slot in the picker without making it selectable. */
  enabled: boolean;

  rating: {
    mode: RatingMode;
    /** 'severity-score' only: the score field's range and the threshold
     *  used for any "severe" business rule (e.g. bigotry's no-bigotry
     *  conflict check). */
    severity?: { min: number; max: number; severeThreshold: number };
    /** 'category-only' only: the fixed score every flag submits, since the
     *  backend's post_flag.score is still NOT NULL — see plan §9. */
    fixedScoreValue?: number;
  };

  /** postType.name (+ score, for severity-score domains) -> CSS badge
   *  class — replaces the old global flagSeverityClass(). */
  badgeClassFor(postTypeName: string, score: number): string;

  /**
   * The one post-type name this domain treats as "neutral" (bigotry's
   * "no-bigotry"), driving resource-detail's conflicting-post dialog and
   * rankings' postProcessRankings filtering. `null` for a domain with no
   * such concept — both of those behaviors become no-ops.
   */
  neutralPostTypeName: string | null;

  /**
   * Optional ranking-list post-processing hook — bigotry's
   * withoutSeverelyFlaggedNoBigotryEntries. Takes `postService` as a
   * parameter (rather than injecting it) so this config stays a plain,
   * DI-free data/function module. Most domains omit this entirely.
   */
  postProcessRankings?(rankings: PostTypeRanking[], postService: PostService): Observable<PostTypeRanking[]>;

  /**
   * CSS custom-property overrides applied to :root while this domain is
   * active — the domain's entire skin. Only the tokens this domain wants
   * to change need appear here; anything omitted falls back to
   * styles.css's base :root values. `imdb/bigotry`'s config uses {} since
   * its values *are* the base :root — it's the default domain.
   */
  themeTokens: Record<string, string>;
}

/**
 * "No Bigotry" is a frontend-only concept — the backend's post_type table
 * has no notion of it (design-spec.md keeps post types/rankings
 * domain-agnostic on the server); every place that treats it specially
 * imports this instead of re-declaring the magic string.
 */
export const NO_BIGOTRY_TYPE_NAME = 'no-bigotry';

/** "No Bigotry" is only meaningful for a movie with nothing flagged this severely or worse. */
export const SEVERE_SCORE_THRESHOLD = 3;

/**
 * Color-codes a flag badge/cell by severity — shared by resource-detail's
 * post table and the search panel's flag-summary columns so both use one
 * consistent scheme. "no-bigotry" is always green regardless of score,
 * since its score is always 0 but that means "clean," not "low severity."
 */
export function flagSeverityClass(postTypeName: string, score: number): string {
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

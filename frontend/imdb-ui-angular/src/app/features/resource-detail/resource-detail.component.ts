import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, map, skip } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { AppHttpError } from '../../core/error.interceptor';
import { PostActivityService } from '../../core/post-activity.service';
import { DomainSelectionService } from '../../core/domain-selection.service';
import { Post, PostService } from '../../api/post.service';
import { Resource, ResourceService } from '../../api/resource.service';
import { PostType } from '../../api/post-flag.service';
import { PostTypeService } from '../../api/post-type.service';
import { AutofocusDirective } from '../../shared/autofocus.directive';
import { ScrollIntoViewOnDirective } from '../../shared/scroll-into-view-on.directive';
import { AutoOpenDialogDirective } from '../../shared/auto-open-dialog.directive';

/**
 * One row of the per-movie flag summary. `averageScore` is `null` for
 * "no-bigotry" — its score is always 0, so an average would be a
 * meaningless (and misleadingly precise-looking) "0.0"; a plain count is
 * more honest about what's actually being reported.
 */
interface CategorySummaryEntry {
  name: string;
  count: number;
  averageScore: number | null;
}

/** A reply's own bodyText + optional bigotry category/severity, one per post it's replying to. */
type ReplyFormGroup = FormGroup<{
  bodyText: FormControl<string>;
  postTypeId: FormControl<number | null>;
  score: FormControl<number | null>;
}>;

type PostSortColumn = 'post' | 'author' | 'category' | 'posted';
type SortDirection = 'asc' | 'desc';

const MIN_POST_COLUMN_PX = 160;
const MAX_POST_COLUMN_PX = 640;
const DEFAULT_POST_COLUMN_PX = 320;
const POST_COLUMN_STORAGE_KEY = 'imdb-ui-angular.post-column-width';
const COLUMN_KEYBOARD_STEP_PX = 20;

// How long a drilled-into post/reply row stays visually highlighted.
const HIGHLIGHT_DURATION_MS = 2500;

// Matches the CSS `line-clamp: 3` on `.body-text--clamped`.
const CLAMPED_LINES = 3;
// Rough average glyph width for the table's 0.9rem sans-serif body text —
// not measured layout, just enough to make the "… more" toggle track the
// resizable Post column instead of using one fixed, width-blind threshold.
const AVG_CHAR_WIDTH_PX = 6;

/** Validators.required alone treats "   " as non-empty — this rejects whitespace-only text too. */
function requiredNonBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value?.trim().length ? null : { required: true };
}

function loadStoredPostColumnWidth(): number | null {
  try {
    const raw = localStorage.getItem(POST_COLUMN_STORAGE_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function clampPostColumnWidth(px: number): number {
  return Math.min(MAX_POST_COLUMN_PX, Math.max(MIN_POST_COLUMN_PX, px));
}

/**
 * Clicking a search result lands here (design-spec.md §8's "resource
 * detail / posting UI" open question, now resolved): shows the resource,
 * its existing top-level posts, and a form to add a new one — optionally
 * flagged with a bigotry category + severity score in the same submit,
 * via the backend's unified POST /posts.
 *
 * Both a new top-level post and a reply keep you here rather than
 * navigating away, so the newly added post/reply is immediately visible
 * in the thread.
 */
@Component({
  selector: 'app-resource-detail',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    ReactiveFormsModule,
    AutofocusDirective,
    ScrollIntoViewOnDirective,
    AutoOpenDialogDirective,
  ],
  templateUrl: './resource-detail.component.html',
  styleUrl: './resource-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResourceDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly resourceService = inject(ResourceService);
  private readonly postService = inject(PostService);
  private readonly postTypeService = inject(PostTypeService);
  private readonly auth = inject(AuthService);
  private readonly postActivity = inject(PostActivityService);
  private readonly domainSelection = inject(DomainSelectionService);
  private readonly destroyRef = inject(DestroyRef);

  private resourceId = 0;
  private readonly replyForms = new Map<number, ReplyFormGroup>();

  readonly resource = signal<Resource | null>(null);
  readonly posts = signal<Post[]>([]);
  readonly postTypes = signal<PostType[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  // Newest-first by default, per design-spec.md §5's "most recent activity
  // first" ordering — matches what the backend already returns, so this is
  // a no-op sort until the user picks a different column.
  readonly sortColumn = signal<PostSortColumn>('posted');
  readonly sortDirection = signal<SortDirection>('desc');
  readonly sortedPosts = computed(() => {
    const column = this.sortColumn();
    const multiplier = this.sortDirection() === 'asc' ? 1 : -1;
    return [...this.posts()].sort((a, b) => multiplier * comparePostsBy(a, b, column));
  });

  readonly form = new FormGroup({
    bodyText: new FormControl('', { nonNullable: true, validators: [requiredNonBlank] }),
    postTypeId: new FormControl<number | null>(null, { validators: [Validators.required] }),
    score: new FormControl<number | null>(null, { validators: [Validators.required] }),
  });
  readonly selectedPostTypeId = toSignal(this.form.controls.postTypeId.valueChanges, { initialValue: null });
  readonly isNoBigotrySelected = computed(() => {
    const id = this.selectedPostTypeId();
    const neutralPostTypeName = this.domainSelection.activeDomainConfig().neutralPostTypeName;
    return id !== null && this.postTypes().find((t) => t.id === id)?.name === neutralPostTypeName;
  });
  /**
   * This movie's flags grouped by category — backend-aggregated (any post
   * depth, not just the top-level posts loaded into `posts()`), same scope
   * as /rankings. A flag on a reply the user hasn't expanded is still
   * counted here even though it isn't in `posts()` at all.
   */
  readonly categorySummary = computed<CategorySummaryEntry[]>(() => {
    const flagSummary = this.resource()?.flagSummary ?? [];
    const config = this.domainSelection.activeDomainConfig();
    const countOnly = config.rating.mode === 'category-only';
    return flagSummary
      .map((entry) => ({
        name: entry.postTypeName,
        count: entry.flagCount,
        averageScore: countOnly || entry.postTypeName === config.neutralPostTypeName ? null : entry.averageScore,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

  // Posting a "No Bigotry" flag surfaces the same user's own prior
  // (now-contradictory) severity-flagged posts on this movie, and vice
  // versa — posting a severity flag surfaces their prior "no-bigotry"
  // posts. The two sides are mutually exclusive: either the prior posts go
  // (confirmRemoveConflictingPosts), or the new one does
  // (keepPreviousFlags) — never both left standing. conflictDirection just
  // picks the dialog copy.
  readonly conflictingPosts = signal<Post[]>([]);
  readonly conflictDirection = signal<'to-no-bigotry' | 'to-severity' | null>(null);
  readonly removingConflicts = signal(false);
  readonly conflictRemovalError = signal<string | null>(null);
  // The post that was just created and triggered the dialog — deleted if
  // the user opts to keep their prior flags instead of it.
  private conflictNewPostId: number | null = null;

  // Replies: keyed by the post they're replying to. Only one reply form
  // open at a time, kept simple since there's no requirement yet for
  // replying to multiple posts concurrently. A post's replies are fetched
  // lazily the first time its row is expanded (or its reply form opened) —
  // `repliesByPost` having a key at all (even `[]`) means "already fetched."
  readonly repliesByPost = signal<Map<number, Post[]>>(new Map());
  readonly repliesLoadingIds = signal<Set<number>>(new Set());
  readonly expandedPostIds = signal<Set<number>>(new Set());
  readonly openReplyPostId = signal<number | null>(null);
  readonly replySubmittingPostId = signal<number | null>(null);
  readonly replyError = signal<string | null>(null);

  // Post/reply bodies clamped to 3 lines by default (both tables share this
  // Set — a top-level post's id and its own replies' ids never collide).
  readonly expandedBodyIds = signal<Set<number>>(new Set());

  // The "Post" column's width, user-resizable via the drag handle on its
  // header — persisted per-viewer the same way the dashboard panels are.
  readonly postColumnWidth = signal(clampPostColumnWidth(loadStoredPostColumnWidth() ?? DEFAULT_POST_COLUMN_PX));
  readonly columnResizing = signal(false);
  private columnDragStartX = 0;
  private columnDragStartWidth = 0;

  // Drilling in from the "My Posts" panel: briefly highlights and scrolls
  // to one specific post/reply row, then clears itself.
  readonly highlightedPostId = signal<number | null>(null);
  // Set from a highlight/parent query param, consumed once posts have
  // finished loading (see the effect below) — kept separate from
  // highlightedPostId itself since applying it may need a network round
  // trip first (ensureHighlightTargetLoaded's larger-page fallback).
  private readonly pendingHighlight = signal<{ postId: number; parentId: number | null } | null>(null);

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => Number(params.get('id'))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((id) => this.load(id));

    // Refetches just the resource (for its flagSummary/postCount) whenever
    // a post/reply/flag is created anywhere on this page — mirrors
    // rankings-panel.component.ts's identical use of this signal. `posts()`
    // itself is already updated locally (this.posts.update(...) at the
    // various submit handlers below), but categorySummary is now sourced
    // from the resource's backend-aggregated flagSummary instead, which
    // this component has no other way to keep in sync. skip(1): same
    // reason as rankings-panel — toObservable() replays the current value
    // immediately, which would otherwise double up with `load()` above.
    toObservable(this.postActivity.changed)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshResourceSummary());

    // A *separate* subscription from paramMap above: clicking another
    // post/reply for the movie you're already viewing only changes query
    // params, not the path's :id segment, and paramMap does not re-emit for
    // that (Angular only re-emits it on a genuine path-param change) — so
    // without this, drilling into a second post on an already-open movie
    // page would silently do nothing.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((queryParams) => {
      if (!queryParams.has('highlight')) {
        // Also fires (harmlessly) from this component's own cleanup
        // navigation below, once the params it's clearing are gone.
        return;
      }
      const postId = Number(queryParams.get('highlight'));
      const parentId = queryParams.has('parent') ? Number(queryParams.get('parent')) : null;
      this.pendingHighlight.set({ postId, parentId });
    });

    effect(() => {
      const pending = this.pendingHighlight();
      // Waits for the current resource's posts to finish loading — covers
      // both a fresh navigation (loading starts true) and re-highlighting
      // on an already-loaded page (loading is already false, applies at once).
      if (pending && !this.loading()) {
        this.pendingHighlight.set(null);
        this.ensureHighlightTargetLoaded(this.resourceId, pending.postId, pending.parentId);
      }
    });

    this.postTypeService
      .listAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (types) => this.postTypes.set(types),
        // A category is required to post at all, so an empty list here just
        // means the form can't be submitted until it loads successfully.
        error: () => this.postTypes.set([]),
      });

    // The severity picker is meaningless (a) for a "no bigotry"-style
    // neutral flag, same as before, or (b) for the whole form, in a
    // category-only rating domain (docs/domain-configurability-plan.md §7)
    // — either way, lock the score to a fixed value and hide the picker
    // (via isSeverityScoreMode()/isNoBigotrySelected() in the template)
    // rather than asking the user to pick a score that isn't meaningful.
    // Disabling the control is also what excludes it from form.invalid —
    // Validators.required stays attached throughout, it just never applies
    // to a disabled control. In a severity-score domain this effect also
    // reads isNoBigotrySelected() (which reads postTypeId), so resetting
    // postTypeId to null re-triggers it and self-heals the score control;
    // a category-only domain's branch never reads postTypeId, so submit()
    // calls applyScoreLock() explicitly after its own form.reset() instead
    // of relying on that same retrigger (see applyScoreLock's doc comment).
    effect(() => this.applyScoreLock());
  }

  /**
   * Locks (or unlocks) the top-level form's score control to match the
   * active domain/category, per the effect above. Also called directly
   * from submit()'s success handler: FormGroup.reset({..., score: null})
   * only preserves a control's disabled state when passed the boxed
   * `{value, disabled}` form — a plain `null` leaves score's *value*
   * permanently null after the first successful post in a category-only
   * domain, since nothing else re-triggers this effect for that domain
   * (its branch never reads postTypeId). That stale null then survives
   * client-side validation (the control is still disabled, so
   * form.invalid never catches it) and gets submitted as-is, tripping the
   * backend's "postTypeId and score must be provided together" check on
   * every post after the first.
   */
  private applyScoreLock(): void {
    const scoreControl = this.form.controls.score;
    const config = this.domainSelection.activeDomainConfig();
    if (config.rating.mode === 'category-only') {
      scoreControl.setValue(config.rating.fixedScoreValue ?? 0);
      scoreControl.disable();
    } else if (this.isNoBigotrySelected()) {
      scoreControl.setValue(0);
      scoreControl.disable();
    } else if (scoreControl.disabled) {
      scoreControl.enable();
      scoreControl.setValue(null);
    }
  }

  /** Whether the active domain uses a numeric severity score at all — see DomainConfig.rating.mode. */
  isSeverityScoreMode(): boolean {
    return this.domainSelection.activeDomainConfig().rating.mode === 'severity-score';
  }

  submit(): void {
    const user = this.auth.currentUser();
    if (!user || this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    // postTypeId and score are both required (form.invalid catches a
    // missing one above), except when score is disabled — the "No Bigotry"
    // auto-set-to-0 case — where getRawValue() still returns its real
    // value even though a disabled control is excluded from form.invalid.
    const { bodyText, postTypeId, score } = this.form.getRawValue();

    this.submitting.set(true);
    this.submitError.set(null);
    this.postService
      .create({
        username: user.username,
        resourceId: this.resourceId,
        bodyText: bodyText.trim(),
        postTypeId: postTypeId ?? undefined,
        score: score ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          // Stay on this page — append the new post so it's visible
          // immediately, rather than navigating away from the thread.
          const flags = response.flag ? [response.flag] : [];
          this.posts.update((posts) => [...posts, { ...response.post, flags }]);
          this.form.reset({ bodyText: '', postTypeId: null, score: null });
          // Restores score's disabled/fixed-value lock immediately — see
          // applyScoreLock's doc comment for why the reset above alone
          // isn't enough for a category-only domain.
          this.applyScoreLock();
          // The side panels (my-posts-panel, rankings-panel) load once and
          // stay mounted across navigation — nudge them to refetch.
          this.postActivity.notifyPostOrReplyCreated();

          if (response.flag) {
            const neutralPostTypeName = this.domainSelection.activeDomainConfig().neutralPostTypeName;
            const direction = response.flag.postType.name === neutralPostTypeName ? 'to-no-bigotry' : 'to-severity';
            this.checkForConflictingPosts(response.post.userId, response.post.id, direction);
          }
        },
        error: (err: unknown) => {
          this.submitError.set(err instanceof AppHttpError ? err.message : 'Failed to create post.');
          this.submitting.set(false);
        },
      });
  }

  /**
   * Clicking the active column reverses direction; clicking a new column
   * switches to it with a sensible default (newest/A-Z first).
   */
  setSort(column: PostSortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set(column === 'posted' ? 'desc' : 'asc');
    }
  }

  /** `aria-sort` value for a column's `<th>` — 'none' when it isn't the active sort. */
  ariaSortFor(column: PostSortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== column) {
      return 'none';
    }
    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  /** Drag-resize the Post column, same pointer-capture pattern as the dashboard's panel splitters. */
  startColumnResize(event: PointerEvent): void {
    event.preventDefault();
    this.columnDragStartX = event.clientX;
    this.columnDragStartWidth = this.postColumnWidth();
    this.columnResizing.set(true);
    const target = event.target as Element;
    if (typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(event.pointerId);
    }
  }

  onColumnResizeMove(event: PointerEvent): void {
    if (!this.columnResizing()) {
      return;
    }
    const delta = event.clientX - this.columnDragStartX;
    this.postColumnWidth.set(clampPostColumnWidth(this.columnDragStartWidth + delta));
  }

  onColumnResizeUp(event: PointerEvent): void {
    if (!this.columnResizing()) {
      return;
    }
    this.columnResizing.set(false);
    this.persistPostColumnWidth();
    const target = event.target as Element;
    if (typeof target.releasePointerCapture === 'function') {
      target.releasePointerCapture(event.pointerId);
    }
  }

  /** Arrow-key resizing for the column handle, per the ARIA separator pattern. */
  onColumnResizeKeydown(event: KeyboardEvent): void {
    let delta = 0;
    if (event.key === 'ArrowLeft') {
      delta = -COLUMN_KEYBOARD_STEP_PX;
    } else if (event.key === 'ArrowRight') {
      delta = COLUMN_KEYBOARD_STEP_PX;
    } else {
      return;
    }
    event.preventDefault();
    this.postColumnWidth.set(clampPostColumnWidth(this.postColumnWidth() + delta));
    this.persistPostColumnWidth();
  }

  private persistPostColumnWidth(): void {
    try {
      localStorage.setItem(POST_COLUMN_STORAGE_KEY, String(this.postColumnWidth()));
    } catch {
      // Best-effort convenience only — fine if storage is unavailable.
    }
  }

  /**
   * Color-codes a flag badge (or category summary card) by severity —
   * "no-bigotry" is always green regardless of score, since its score is
   * always 0 but that means "clean," not "low severity."
   */
  flagSeverityClass(postTypeName: string, score: number): string {
    return this.domainSelection.activeDomainConfig().badgeClassFor(postTypeName, score);
  }

  /**
   * Lazily creates (and reuses) a reply's form group — bodyText plus an
   * optional bigotry category/severity, unlike the top-level form's
   * required pair. `score` starts with no validators (category is
   * optional); onReplyPostTypeChange toggles Validators.required onto it
   * once a category is actually picked, same pairing rule the backend
   * enforces server-side ("postTypeId and score must be provided together").
   */
  getReplyForm(postId: number): ReplyFormGroup {
    let form = this.replyForms.get(postId);
    if (!form) {
      form = new FormGroup({
        bodyText: new FormControl('', { nonNullable: true, validators: [requiredNonBlank] }),
        postTypeId: new FormControl<number | null>(null),
        score: new FormControl<number | null>(null),
      });
      this.replyForms.set(postId, form);
    }
    return form;
  }

  /** Mirrors the top-level form's isNoBigotrySelected, scoped to one reply's own form. */
  isReplyNoBigotrySelected(postId: number): boolean {
    const id = this.getReplyForm(postId).controls.postTypeId.value;
    const neutralPostTypeName = this.domainSelection.activeDomainConfig().neutralPostTypeName;
    return id !== null && this.postTypes().find((t) => t.id === id)?.name === neutralPostTypeName;
  }

  /**
   * Mirrors the top-level form's score-locking effect, but as a (change)
   * handler rather than an effect() — there's one form per post, created on
   * demand, so there's no single control to attach a constructor-time
   * effect to.
   */
  onReplyPostTypeChange(postId: number): void {
    const form = this.getReplyForm(postId);
    const scoreControl = form.controls.score;
    const config = this.domainSelection.activeDomainConfig();
    if (config.rating.mode === 'category-only') {
      scoreControl.setValue(config.rating.fixedScoreValue ?? 0);
      scoreControl.disable();
      scoreControl.clearValidators();
    } else if (this.isReplyNoBigotrySelected(postId)) {
      scoreControl.setValue(0);
      scoreControl.disable();
      scoreControl.clearValidators();
    } else if (form.controls.postTypeId.value !== null) {
      scoreControl.enable();
      scoreControl.setValue(null);
      scoreControl.setValidators([Validators.required]);
    } else {
      // Category cleared back to "— None —" — severity becomes irrelevant again.
      scoreControl.enable();
      scoreControl.setValue(null);
      scoreControl.clearValidators();
    }
    scoreControl.updateValueAndValidity();
  }

  /** True once the user has tried to submit a blank reply — drives the inline error message. */
  isReplyInvalid(postId: number): boolean {
    const control = this.getReplyForm(postId).controls.bodyText;
    return control.invalid && control.touched;
  }

  repliesFor(postId: number): Post[] {
    return this.repliesByPost().get(postId) ?? [];
  }

  isExpanded(postId: number): boolean {
    return this.expandedPostIds().has(postId);
  }

  repliesLoading(postId: number): boolean {
    return this.repliesLoadingIds().has(postId);
  }

  toggleExpand(postId: number): void {
    const wasOpen = this.isExpanded(postId);
    this.expandedPostIds.update((ids) => {
      const next = new Set(ids);
      wasOpen ? next.delete(postId) : next.add(postId);
      return next;
    });
    if (!wasOpen) {
      this.ensureRepliesLoaded(postId);
    }
  }

  /** Width-aware: narrowing the Post column lowers this, so the toggle stays honest as it resizes. */
  isLongPost(bodyText: string): boolean {
    const charsPerLine = this.postColumnWidth() / AVG_CHAR_WIDTH_PX;
    return bodyText.length > charsPerLine * CLAMPED_LINES;
  }

  isBodyExpanded(postId: number): boolean {
    return this.expandedBodyIds().has(postId);
  }

  toggleBodyExpand(postId: number): void {
    this.expandedBodyIds.update((ids) => {
      const next = new Set(ids);
      next.has(postId) ? next.delete(postId) : next.add(postId);
      return next;
    });
  }

  toggleReply(postId: number): void {
    this.replyError.set(null);
    const opening = this.openReplyPostId() !== postId;
    this.openReplyPostId.set(opening ? postId : null);
    if (opening) {
      this.ensureRepliesLoaded(postId);
    }
  }

  /** Fetches a post's existing replies once, the first time they're needed. */
  private ensureRepliesLoaded(postId: number): void {
    if (this.repliesByPost().has(postId) || this.repliesLoadingIds().has(postId)) {
      return;
    }
    this.repliesLoadingIds.update((ids) => new Set(ids).add(postId));
    this.postService
      .listReplies(postId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.repliesByPost.update((byPost) => new Map(byPost).set(postId, page.content));
          this.repliesLoadingIds.update((ids) => {
            const next = new Set(ids);
            next.delete(postId);
            return next;
          });
        },
        error: () => {
          this.repliesLoadingIds.update((ids) => {
            const next = new Set(ids);
            next.delete(postId);
            return next;
          });
        },
      });
  }

  submitReply(postId: number): void {
    const user = this.auth.currentUser();
    const form = this.getReplyForm(postId);
    if (!user || form.invalid || this.replySubmittingPostId() !== null) {
      form.markAllAsTouched();
      return;
    }

    // postTypeId/score are optional here (unlike the top-level form) — both
    // null just means "an unflagged reply," same as the old reply endpoint
    // always sent. getRawValue() so a disabled, no-bigotry-locked score of 0
    // still comes through, same reason submit() above uses it.
    const { bodyText, postTypeId, score } = form.getRawValue();

    this.replySubmittingPostId.set(postId);
    this.replyError.set(null);
    this.postService
      .create({
        username: user.username,
        resourceId: this.resourceId,
        parentPostId: postId,
        bodyText: bodyText.trim(),
        postTypeId: postTypeId ?? undefined,
        score: score ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const flags = response.flag ? [response.flag] : [];
          const reply: Post = { ...response.post, flags };
          this.repliesByPost.update((byPost) => {
            const next = new Map(byPost);
            next.set(postId, [...(next.get(postId) ?? []), reply]);
            return next;
          });
          // The create response doesn't carry the parent's updated
          // replyCount (design-spec.md — list-endpoints-only field), and
          // this is the only local copy of it, so bump it by hand. Without
          // this, a post's expand caret (replyCount > 0) and count badge
          // stay stale until the page is reloaded.
          this.posts.update((posts) =>
            posts.map((p) => (p.id === postId ? { ...p, replyCount: p.replyCount + 1 } : p)),
          );
          form.reset({ bodyText: '', postTypeId: null, score: null });
          this.openReplyPostId.set(null);
          this.replySubmittingPostId.set(null);
          // Reply — stay on this page, no navigation.
          this.postActivity.notifyPostOrReplyCreated();
        },
        error: (err: unknown) => {
          this.replyError.set(err instanceof AppHttpError ? err.message : 'Failed to post reply.');
          this.replySubmittingPostId.set(null);
        },
      });
  }

  private load(id: number): void {
    this.resourceId = id;
    this.loading.set(true);
    this.loadError.set(null);
    this.highlightedPostId.set(null);

    this.resourceService
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resource) => this.resource.set(resource),
        error: (err: unknown) => {
          this.loadError.set(err instanceof AppHttpError ? err.message : 'Failed to load resource.');
        },
      });

    this.postService
      .listTopLevel(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.posts.set(page.content);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loadError.set(err instanceof AppHttpError ? err.message : 'Failed to load posts.');
          this.loading.set(false);
        },
      });
  }

  /** Just the resource (for categorySummary/postCount) — not the posts list, which updates itself locally. */
  private refreshResourceSummary(): void {
    this.resourceService
      .get(this.resourceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resource) => this.resource.set(resource),
        // Best-effort — the summary just stays as of the last successful
        // load rather than blocking or erroring the whole page over it.
        error: () => {},
      });
  }

  /**
   * The default page is only the 20 most recent top-level posts, which can
   * miss a drill-down target on a busy movie (either the target itself, for
   * a top-level post, or its parent, for a reply). Re-fetch a much larger
   * page — matching the "just get basically everything" convention
   * rankings-panel already uses for its own severity check — rather than
   * silently doing nothing.
   */
  private ensureHighlightTargetLoaded(resourceId: number, postId: number, parentId: number | null): void {
    const idThatMustBeLoaded = parentId ?? postId;
    if (this.posts().some((p) => p.id === idThatMustBeLoaded)) {
      this.highlightPost(postId, parentId);
      return;
    }
    this.postService
      .listTopLevel(resourceId, 0, 200)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.posts.set(page.content);
          this.highlightPost(postId, parentId);
        },
        // Best-effort — if it's still not there, just skip the highlight
        // rather than leaving the page stuck waiting for one.
        error: () => {},
      });
  }

  /**
   * A reply isn't in `posts` (it's fetched lazily per-post), so a reply
   * target expands its parent's thread first — the row then mounts once
   * replies finish loading, and appScrollIntoViewOn picks it up from there.
   */
  private highlightPost(postId: number, parentId: number | null): void {
    if (parentId !== null && !this.isExpanded(parentId)) {
      this.toggleExpand(parentId);
    }
    this.highlightedPostId.set(postId);
    const timeoutId = setTimeout(() => this.highlightedPostId.set(null), HIGHLIGHT_DURATION_MS);
    this.destroyRef.onDestroy(() => clearTimeout(timeoutId));

    // Drop the highlight/parent query params so a refresh doesn't
    // re-trigger this and the URL doesn't stay cluttered. Done here (async,
    // well after the original navigation settled) rather than synchronously
    // inside the paramMap subscriber that's still resolving it.
    this.router.navigate(['/resources', this.resourceId], { replaceUrl: true });
  }

  /**
   * The default page (20 most recent) may not include everything this user
   * has ever posted on this movie — fetch a much larger page (the same
   * "just get basically everything" convention used elsewhere) so the
   * conflict list is actually complete, not just "whatever happened to be
   * loaded already."
   */
  private checkForConflictingPosts(
    userId: number,
    excludePostId: number,
    direction: 'to-no-bigotry' | 'to-severity',
  ): void {
    const neutralPostTypeName = this.domainSelection.activeDomainConfig().neutralPostTypeName;
    // No neutral-flag concept in this domain (e.g. a category-only rating
    // domain) — there's nothing that could contradict, so skip the check
    // entirely rather than fetching posts just to find no conflicts.
    if (neutralPostTypeName === null) {
      return;
    }

    this.postService
      .listTopLevel(this.resourceId, 0, 200)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          const isConflicting = (post: Post) =>
            direction === 'to-no-bigotry'
              ? hasNonNoBigotryFlag(post, neutralPostTypeName)
              : hasNoBigotryFlag(post, neutralPostTypeName);
          const conflicts = findConflictingPosts(page.content, userId, excludePostId, isConflicting);
          if (conflicts.length > 0) {
            this.conflictDirection.set(direction);
            this.conflictingPosts.set(conflicts);
            this.conflictNewPostId = excludePostId;
          }
        },
        // Best-effort — the new post already succeeded either way; if this
        // check itself fails, just skip the prompt rather than block on it.
        error: () => {},
      });
  }

  /**
   * The other half of the mutually-exclusive choice: keeps the prior posts
   * standing and deletes the one just created instead (also cascading to
   * any reply it may have already picked up in the meantime).
   */
  keepPreviousFlags(): void {
    const user = this.auth.currentUser();
    const newPostId = this.conflictNewPostId;
    if (!user || newPostId === null || this.removingConflicts()) {
      return;
    }

    this.removingConflicts.set(true);
    this.conflictRemovalError.set(null);
    this.postService
      .delete(newPostId, user.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.posts.update((all) => all.filter((post) => post.id !== newPostId));
          this.closeConflictDialog();
          this.postActivity.notifyPostOrReplyCreated();
        },
        error: (err: unknown) => {
          this.conflictRemovalError.set(
            err instanceof AppHttpError ? err.message : 'Failed to discard the new post.',
          );
          this.removingConflicts.set(false);
        },
      });
  }

  private closeConflictDialog(): void {
    this.conflictingPosts.set([]);
    this.conflictDirection.set(null);
    this.conflictNewPostId = null;
    this.removingConflicts.set(false);
    this.conflictRemovalError.set(null);
  }

  /**
   * Deletes every listed post in one batch. Each DELETE cascades server-side
   * to that post's entire reply subtree — including replies from other
   * users, since the cascade walks the reply tree, not authorship (the
   * dialog says as much before this is ever called).
   */
  confirmRemoveConflictingPosts(): void {
    const user = this.auth.currentUser();
    const posts = this.conflictingPosts();
    if (!user || posts.length === 0 || this.removingConflicts()) {
      return;
    }

    this.removingConflicts.set(true);
    this.conflictRemovalError.set(null);
    forkJoin(posts.map((post) => this.postService.delete(post.id, user.id)))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const removedIds = new Set(posts.map((post) => post.id));
          this.posts.update((all) => all.filter((post) => !removedIds.has(post.id)));
          this.closeConflictDialog();
          // Rankings/side panels may have depended on the flags that just
          // disappeared with these posts.
          this.postActivity.notifyPostOrReplyCreated();
        },
        error: (err: unknown) => {
          this.conflictRemovalError.set(
            err instanceof AppHttpError ? err.message : 'Failed to remove one or more posts.',
          );
          this.removingConflicts.set(false);
        },
      });
  }
}

/** Any score counts, including 0 (neutral): it's the *category* that contradicts the neutral flag, not the severity. */
function hasNonNoBigotryFlag(post: Post, neutralPostTypeName: string): boolean {
  return post.flags.some((flag) => flag.postType.name !== neutralPostTypeName);
}

function hasNoBigotryFlag(post: Post, neutralPostTypeName: string): boolean {
  return post.flags.some((flag) => flag.postType.name === neutralPostTypeName);
}

/**
 * This user's other top-level posts on this movie that now contradict the
 * flag they just posted — either their prior severity-flagged posts (after
 * posting "no-bigotry") or their prior "no-bigotry" posts (after posting a
 * severity flag), depending on `isConflicting`. Candidates to offer
 * removing, not removed automatically.
 */
function findConflictingPosts(
  posts: Post[],
  userId: number,
  excludePostId: number,
  isConflicting: (post: Post) => boolean,
): Post[] {
  return posts.filter((post) => post.userId === userId && post.id !== excludePostId && isConflicting(post));
}

/**
 * A post can carry multiple category flags, but the "Category (Score)"
 * column only has room to sort by one — the first flag, alphabetically by
 * category and then by score. Posts with no flags sort before flagged ones
 * in ascending order (nothing to compare, treated as "least").
 */
function comparePostsBy(a: Post, b: Post, column: PostSortColumn): number {
  switch (column) {
    case 'post':
      return a.bodyText.localeCompare(b.bodyText);
    case 'author':
      return a.username.localeCompare(b.username);
    case 'category': {
      const [aFlag, bFlag] = [a.flags[0], b.flags[0]];
      if (!aFlag || !bFlag) {
        return Number(Boolean(aFlag)) - Number(Boolean(bFlag));
      }
      return aFlag.postType.name.localeCompare(bFlag.postType.name) || aFlag.score - bFlag.score;
    }
    case 'posted':
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
  }
}

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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { AppHttpError } from '../../core/error.interceptor';
import { PostActivityService } from '../../core/post-activity.service';
import { NO_BIGOTRY_TYPE_NAME, flagSeverityClass as computeFlagSeverityClass } from '../../core/post-type.constants';
import { Post, PostService } from '../../api/post.service';
import { Resource, ResourceService } from '../../api/resource.service';
import { PostType } from '../../api/post-flag.service';
import { PostTypeService } from '../../api/post-type.service';
import { AutofocusDirective } from '../../shared/autofocus.directive';
import { ScrollIntoViewOnDirective } from '../../shared/scroll-into-view-on.directive';

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
  imports: [DatePipe, DecimalPipe, RouterLink, ReactiveFormsModule, AutofocusDirective, ScrollIntoViewOnDirective],
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
  private readonly destroyRef = inject(DestroyRef);

  private resourceId = 0;
  private readonly replyControls = new Map<number, FormControl<string>>();

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
    return id !== null && this.postTypes().find((t) => t.id === id)?.name === NO_BIGOTRY_TYPE_NAME;
  });
  /** This movie's flags grouped by category — same top-level-posts-only data used elsewhere on this page. */
  readonly categorySummary = computed<CategorySummaryEntry[]>(() => {
    const totals = new Map<string, { total: number; count: number }>();
    for (const post of this.posts()) {
      for (const flag of post.flags) {
        const entry = totals.get(flag.postType.name) ?? { total: 0, count: 0 };
        entry.total += flag.score;
        entry.count += 1;
        totals.set(flag.postType.name, entry);
      }
    }
    return Array.from(totals.entries())
      .map(([name, { total, count }]) => ({
        name,
        count,
        averageScore: name === NO_BIGOTRY_TYPE_NAME ? null : total / count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);

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

    // "No Bigotry" is a neutral flag — the severity picker is meaningless
    // for it, so lock the score to 0 and hide the picker (via
    // isNoBigotrySelected in the template) rather than asking the user to
    // pick a score for a category that only ever means "no bigotry found."
    effect(() => {
      const scoreControl = this.form.controls.score;
      if (this.isNoBigotrySelected()) {
        scoreControl.setValue(0);
        scoreControl.disable();
      } else if (scoreControl.disabled) {
        scoreControl.enable();
        scoreControl.setValue(null);
      }
    });
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
          // The side panels (my-posts-panel, rankings-panel) load once and
          // stay mounted across navigation — nudge them to refetch.
          this.postActivity.notifyPostOrReplyCreated();
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
    return computeFlagSeverityClass(postTypeName, score);
  }

  /** Lazily creates (and reuses) the reply textarea's control for a given post. */
  getReplyControl(postId: number): FormControl<string> {
    let control = this.replyControls.get(postId);
    if (!control) {
      control = new FormControl('', { nonNullable: true, validators: [requiredNonBlank] });
      this.replyControls.set(postId, control);
    }
    return control;
  }

  /** True once the user has tried to submit a blank reply — drives the inline error message. */
  isReplyInvalid(postId: number): boolean {
    const control = this.getReplyControl(postId);
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
    const control = this.getReplyControl(postId);
    if (!user || control.invalid || this.replySubmittingPostId() !== null) {
      control.markAsTouched();
      return;
    }

    this.replySubmittingPostId.set(postId);
    this.replyError.set(null);
    this.postService
      .reply(postId, { userId: user.id, bodyText: control.value.trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reply) => {
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
          control.reset('');
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

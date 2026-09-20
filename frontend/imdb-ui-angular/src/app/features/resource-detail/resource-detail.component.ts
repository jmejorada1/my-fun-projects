import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { AppHttpError } from '../../core/error.interceptor';
import {
  NO_BIGOTRY_TYPE_NAME,
  SEVERE_SCORE_THRESHOLD,
  flagSeverityClass as computeFlagSeverityClass,
} from '../../core/post-type.constants';
import { Post, PostService } from '../../api/post.service';
import { Resource, ResourceService } from '../../api/resource.service';
import { PostType } from '../../api/post-flag.service';
import { PostTypeService } from '../../api/post-type.service';

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

// Matches the CSS `line-clamp: 3` on `.body-text--clamped`.
const CLAMPED_LINES = 3;
// Rough average glyph width for the table's 0.9rem sans-serif body text —
// not measured layout, just enough to make the "… more" toggle track the
// resizable Post column instead of using one fixed, width-blind threshold.
const AVG_CHAR_WIDTH_PX = 6;

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
  imports: [DatePipe, DecimalPipe, RouterLink, ReactiveFormsModule],
  templateUrl: './resource-detail.component.html',
  styleUrl: './resource-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResourceDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly resourceService = inject(ResourceService);
  private readonly postService = inject(PostService);
  private readonly postTypeService = inject(PostTypeService);
  private readonly auth = inject(AuthService);
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
    bodyText: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    postTypeId: new FormControl<number | null>(null),
    score: new FormControl<number | null>(null),
  });
  readonly selectedPostTypeId = toSignal(this.form.controls.postTypeId.valueChanges, { initialValue: null });
  readonly isNoBigotrySelected = computed(() => {
    const id = this.selectedPostTypeId();
    return id !== null && this.postTypes().find((t) => t.id === id)?.name === NO_BIGOTRY_TYPE_NAME;
  });
  /**
   * Purely a frontend rule — the backend's post_type list has no concept of
   * "no-bigotry" or of one category depending on another's flags, it's
   * just lookup data. This resource's already-loaded top-level posts (the
   * only kind that can carry a flag through this UI — replies have no
   * category/score fields) are enough to decide it without a new endpoint.
   */
  readonly hasSevereFlag = computed(() =>
    this.posts().some((post) => post.flags.some((flag) => flag.score >= SEVERE_SCORE_THRESHOLD)),
  );
  readonly visiblePostTypes = computed(() => {
    const types = this.postTypes();
    return this.hasSevereFlag() ? types.filter((t) => t.name !== NO_BIGOTRY_TYPE_NAME) : types;
  });
  /** This movie's flags grouped by category — same top-level-posts-only data as hasSevereFlag. */
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

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => Number(params.get('id'))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((id) => this.load(id));

    this.postTypeService
      .listAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (types) => this.postTypes.set(types),
        // Not fatal — plain-text posting still works without the flag dropdown.
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

    // If a newly-added post makes this movie ineligible for "No Bigotry"
    // while it's still selected (e.g. two posts submitted back to back),
    // clear the now-hidden selection rather than silently submitting it.
    effect(() => {
      if (this.hasSevereFlag() && this.isNoBigotrySelected()) {
        this.form.controls.postTypeId.setValue(null);
      }
    });
  }

  submit(): void {
    const user = this.auth.currentUser();
    if (!user || this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const { bodyText, postTypeId, score } = this.form.getRawValue();
    if ((postTypeId == null) !== (score == null)) {
      this.submitError.set('Pick a category and a score together, or leave both blank.');
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);
    this.postService
      .create({
        username: user.username,
        resourceId: this.resourceId,
        bodyText,
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
      control = new FormControl('', { nonNullable: true, validators: [Validators.required] });
      this.replyControls.set(postId, control);
    }
    return control;
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
      .reply(postId, { userId: user.id, bodyText: control.value })
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

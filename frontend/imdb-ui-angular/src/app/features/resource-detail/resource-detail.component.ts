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

/** `averageScore` is null where an average means nothing: the neutral flag (always 0) and count-only domains. */
interface CategorySummaryEntry {
  name: string;
  count: number;
  averageScore: number | null;
}

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

const HIGHLIGHT_DURATION_MS = 2500;

// Matches the CSS `line-clamp: 3` on `.body-text--clamped`.
const CLAMPED_LINES = 3;
// Rough glyph width of the 0.9rem body text, to estimate when a post overflows the clamp.
const AVG_CHAR_WIDTH_PX = 6;

/** Validators.required accepts whitespace-only text; this doesn't. */
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

  // Newest first, the backend's own order.
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
  /** From the backend's flagSummary, so it also counts flags on replies that aren't loaded. */
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

  // The user's earlier posts whose flag contradicts the one just posted (neutral vs severity).
  // Either they go (confirmRemoveConflictingPosts) or the new post does (keepPreviousFlags).
  readonly conflictingPosts = signal<Post[]>([]);
  readonly conflictDirection = signal<'to-no-bigotry' | 'to-severity' | null>(null);
  readonly removingConflicts = signal(false);
  readonly conflictRemovalError = signal<string | null>(null);
  private conflictNewPostId: number | null = null;

  // Keyed by parent post id and fetched on first use; a key (even with `[]`) means already fetched.
  readonly repliesByPost = signal<Map<number, Post[]>>(new Map());
  readonly repliesLoadingIds = signal<Set<number>>(new Set());
  readonly expandedPostIds = signal<Set<number>>(new Set());
  readonly openReplyPostId = signal<number | null>(null);
  readonly replySubmittingPostId = signal<number | null>(null);
  readonly replyError = signal<string | null>(null);

  // Shared by posts and replies, whose ids never collide.
  readonly expandedBodyIds = signal<Set<number>>(new Set());

  readonly postColumnWidth = signal(clampPostColumnWidth(loadStoredPostColumnWidth() ?? DEFAULT_POST_COLUMN_PX));
  readonly columnResizing = signal(false);
  private columnDragStartX = 0;
  private columnDragStartWidth = 0;

  // Set when drilling in from My Posts, cleared after HIGHLIGHT_DURATION_MS.
  readonly highlightedPostId = signal<number | null>(null);
  // Held until posts finish loading; applying it may need another fetch first.
  private readonly pendingHighlight = signal<{ postId: number; parentId: number | null } | null>(null);

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => Number(params.get('id'))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((id) => this.load(id));

    // Keeps flagSummary/postCount current. skip(1): toObservable() emits the
    // current value at once, which load() already covers.
    toObservable(this.postActivity.changed)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshResourceSummary());

    // Separate from paramMap, which doesn't re-emit when drilling into
    // another post on the same movie (only the query params change).
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((queryParams) => {
      if (!queryParams.has('highlight')) {
        // Includes highlightPost's own cleanup navigation.
        return;
      }
      const postId = Number(queryParams.get('highlight'));
      const parentId = queryParams.has('parent') ? Number(queryParams.get('parent')) : null;
      this.pendingHighlight.set({ postId, parentId });
    });

    effect(() => {
      const pending = this.pendingHighlight();
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
        // Without types the form can't be submitted, since a category is required.
        error: () => this.postTypes.set([]),
      });

    // Score is meaningless for the neutral flag and in category-only domains,
    // so it's fixed and disabled there (a disabled control skips validation).
    effect(() => this.applyScoreLock());
  }

  /**
   * Also called after submit()'s reset(), which nulls the disabled score. In a
   * category-only domain nothing re-runs the effect, so the next post would
   * send a null score and fail the backend's postTypeId/score pairing check.
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

  isSeverityScoreMode(): boolean {
    return this.domainSelection.activeDomainConfig().rating.mode === 'severity-score';
  }

  submit(): void {
    const user = this.auth.currentUser();
    if (!user || this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    // getRawValue() includes the disabled, fixed score.
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
          const flags = response.flag ? [response.flag] : [];
          this.posts.update((posts) => [...posts, { ...response.post, flags }]);
          this.form.reset({ bodyText: '', postTypeId: null, score: null });
          this.applyScoreLock();
          // The side panels stay mounted across navigation, so tell them to refetch.
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

  setSort(column: PostSortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set(column === 'posted' ? 'desc' : 'asc');
    }
  }

  ariaSortFor(column: PostSortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== column) {
      return 'none';
    }
    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

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
      // Storage is optional.
    }
  }

  flagSeverityClass(postTypeName: string, score: number): string {
    return this.domainSelection.activeDomainConfig().badgeClassFor(postTypeName, score);
  }

  /** Category is optional on replies; onReplyPostTypeChange requires a score once one is picked. */
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

  isReplyNoBigotrySelected(postId: number): boolean {
    const id = this.getReplyForm(postId).controls.postTypeId.value;
    const neutralPostTypeName = this.domainSelection.activeDomainConfig().neutralPostTypeName;
    return id !== null && this.postTypes().find((t) => t.id === id)?.name === neutralPostTypeName;
  }

  /** applyScoreLock for reply forms, run on (change) since the forms are created on demand. */
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
      scoreControl.enable();
      scoreControl.setValue(null);
      scoreControl.clearValidators();
    }
    scoreControl.updateValueAndValidity();
  }

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

    // getRawValue() includes the disabled, fixed score.
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
          // The create response doesn't include the parent, so bump its replyCount here.
          this.posts.update((posts) =>
            posts.map((p) => (p.id === postId ? { ...p, replyCount: p.replyCount + 1 } : p)),
          );
          form.reset({ bodyText: '', postTypeId: null, score: null });
          this.openReplyPostId.set(null);
          this.replySubmittingPostId.set(null);
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

  private refreshResourceSummary(): void {
    this.resourceService
      .get(this.resourceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resource) => this.resource.set(resource),
        // Best-effort: keep the last summary.
        error: () => {},
      });
  }

  /** The default page (20 newest) may miss the target or a reply's parent, so refetch up to 200. */
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
        // Best-effort: skip the highlight.
        error: () => {},
      });
  }

  /** A reply target expands its parent; appScrollIntoViewOn scrolls once the row renders. */
  private highlightPost(postId: number, parentId: number | null): void {
    if (parentId !== null && !this.isExpanded(parentId)) {
      this.toggleExpand(parentId);
    }
    this.highlightedPostId.set(postId);
    const timeoutId = setTimeout(() => this.highlightedPostId.set(null), HIGHLIGHT_DURATION_MS);
    this.destroyRef.onDestroy(() => clearTimeout(timeoutId));

    // Clear the query params so a refresh doesn't highlight again.
    this.router.navigate(['/resources', this.resourceId], { replaceUrl: true });
  }

  /** Fetches up to 200 posts so conflicts beyond the default page of 20 are found. */
  private checkForConflictingPosts(
    userId: number,
    excludePostId: number,
    direction: 'to-no-bigotry' | 'to-severity',
  ): void {
    const neutralPostTypeName = this.domainSelection.activeDomainConfig().neutralPostTypeName;
    // Without a neutral flag nothing can conflict.
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
        // Best-effort: the new post already succeeded.
        error: () => {},
      });
  }

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

  /** Each delete cascades to the whole reply tree, other users' replies included (the dialog warns). */
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

function hasNonNoBigotryFlag(post: Post, neutralPostTypeName: string): boolean {
  return post.flags.some((flag) => flag.postType.name !== neutralPostTypeName);
}

function hasNoBigotryFlag(post: Post, neutralPostTypeName: string): boolean {
  return post.flags.some((flag) => flag.postType.name === neutralPostTypeName);
}

function findConflictingPosts(
  posts: Post[],
  userId: number,
  excludePostId: number,
  isConflicting: (post: Post) => boolean,
): Post[] {
  return posts.filter((post) => post.userId === userId && post.id !== excludePostId && isConflicting(post));
}

/** Category sorts on each post's first flag only. Unflagged posts sort first when ascending. */
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

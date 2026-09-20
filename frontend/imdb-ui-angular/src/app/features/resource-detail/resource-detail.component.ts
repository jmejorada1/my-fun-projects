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

import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { skip } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { AppHttpError } from '../../core/error.interceptor';
import { PostActivityService } from '../../core/post-activity.service';
import { Post, PostService } from '../../api/post.service';

/** One movie's worth of the user's posts (or replies), for the tree view. */
interface MovieGroup {
  resourceId: number;
  displayName: string;
  posts: Post[];
}

function groupByMovie(posts: Post[]): MovieGroup[] {
  const byResource = new Map<number, MovieGroup>();
  for (const post of posts) {
    const group = byResource.get(post.resourceId);
    if (group) {
      group.posts.push(post);
    } else {
      byResource.set(post.resourceId, {
        resourceId: post.resourceId,
        displayName: post.resourceDisplayName ?? `Resource #${post.resourceId}`,
        posts: [post],
      });
    }
  }
  return Array.from(byResource.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function toggled(ids: Set<number>, id: number): Set<number> {
  const next = new Set(ids);
  next.has(id) ? next.delete(id) : next.add(id);
  return next;
}

// Gates the "… more" toggle — actual clamping is CSS `line-clamp` (3
// lines), same approach as the resource-detail posts table.
const LONG_POST_CHAR_THRESHOLD = 160;

/**
 * Left panel — every post the logged-in user authored (design-spec.md §3),
 * split into top-level posts and replies by `parentPostId` — the backend
 * returns both mixed from the one endpoint, so the split is purely a
 * client-side presentation choice, not a second request. The "My Posts" /
 * "My Replies" sections collapse independently and start expanded; the
 * movie groups nested inside each one are a separate expandable tree,
 * collapsed by default: an "expanded ids" set means every group starts
 * closed with no setup needed once the posts arrive.
 */
@Component({
  selector: 'app-my-posts-panel',
  imports: [DatePipe],
  templateUrl: './my-posts-panel.component.html',
  styleUrl: './my-posts-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyPostsPanelComponent {
  private readonly auth = inject(AuthService);
  private readonly postService = inject(PostService);
  private readonly postActivity = inject(PostActivityService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly posts = signal<Post[]>([]);
  readonly topLevelPosts = computed(() => this.posts().filter((p) => p.parentPostId === null));
  readonly replies = computed(() => this.posts().filter((p) => p.parentPostId !== null));
  readonly topLevelGroups = computed(() => groupByMovie(this.topLevelPosts()));
  readonly replyGroups = computed(() => groupByMovie(this.replies()));
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private readonly expandedPostGroupIds = signal<Set<number>>(new Set());
  private readonly expandedReplyGroupIds = signal<Set<number>>(new Set());
  // A post's and its own replies' ids never collide, so one Set covers both trees.
  private readonly expandedBodyIds = signal<Set<number>>(new Set());

  // The "My Posts" / "My Replies" sections themselves — expanded by
  // default, unlike the movie groups nested inside them.
  readonly postsSectionExpanded = signal(true);
  readonly repliesSectionExpanded = signal(true);

  constructor() {
    const user = this.auth.currentUser();
    if (user) {
      this.load(user.id);
    }

    // Refetches whenever a post/reply is created anywhere in the app
    // (resource-detail) — this panel is mounted for the dashboard's whole
    // lifetime (dashboard.component.ts), so without this it would only ever
    // show what existed at page load. skip(1): toObservable() immediately
    // replays the signal's current value on subscribe, which would
    // otherwise double up with the initial load() call above.
    toObservable(this.postActivity.changed)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const currentUser = this.auth.currentUser();
        if (currentUser) {
          this.load(currentUser.id);
        }
      });
  }

  isPostGroupExpanded(resourceId: number): boolean {
    return this.expandedPostGroupIds().has(resourceId);
  }

  togglePostGroup(resourceId: number): void {
    this.expandedPostGroupIds.update((ids) => toggled(ids, resourceId));
  }

  isReplyGroupExpanded(resourceId: number): boolean {
    return this.expandedReplyGroupIds().has(resourceId);
  }

  toggleReplyGroup(resourceId: number): void {
    this.expandedReplyGroupIds.update((ids) => toggled(ids, resourceId));
  }

  togglePostsSection(): void {
    this.postsSectionExpanded.update((expanded) => !expanded);
  }

  toggleRepliesSection(): void {
    this.repliesSectionExpanded.update((expanded) => !expanded);
  }

  isLongPost(bodyText: string): boolean {
    return bodyText.length > LONG_POST_CHAR_THRESHOLD;
  }

  isBodyExpanded(postId: number): boolean {
    return this.expandedBodyIds().has(postId);
  }

  toggleBodyExpand(postId: number): void {
    this.expandedBodyIds.update((ids) => toggled(ids, postId));
  }

  /**
   * Drill-down: jumps to the movie's resource-detail page and tells it
   * which row to scroll to and briefly highlight. A reply isn't its own row
   * in that page's table (it only shows up once its parent's thread is
   * expanded), so `parent` carries the top-level post to expand — null for
   * a plain top-level post, where the post's own row already exists.
   */
  goToPost(post: Post): void {
    this.router.navigate(['/resources', post.resourceId], {
      queryParams: { highlight: post.id, parent: post.parentPostId },
    });
  }

  private load(userId: number): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.postService
      .listByUser(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.posts.set(page.content);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.errorMessage.set(err instanceof AppHttpError ? err.message : 'Failed to load your posts.');
          this.loading.set(false);
        },
      });
  }
}

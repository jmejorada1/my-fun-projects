import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth.service';
import { AppHttpError } from '../../core/error.interceptor';
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

/**
 * Left panel — every post the logged-in user authored (design-spec.md §5),
 * split into top-level posts and replies by `parentPostId` — the backend
 * returns both mixed from the one endpoint, so the split is purely a
 * client-side presentation choice, not a second request. Each section is
 * an expandable tree grouped by movie, collapsed by default: an
 * "expanded ids" set means every group starts closed with no setup needed
 * once the posts arrive.
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

  constructor() {
    const user = this.auth.currentUser();
    if (user) {
      this.load(user.id);
    }
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

  private load(userId: number): void {
    this.loading.set(true);
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

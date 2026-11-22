import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { skip } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { AppHttpError } from '../../core/error.interceptor';
import { PostActivityService } from '../../core/post-activity.service';
import { Post, PostService } from '../../api/post.service';

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

// Shows the "… more" toggle; the clamp itself is CSS `line-clamp`.
const LONG_POST_CHAR_THRESHOLD = 160;

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

  readonly postsSectionExpanded = signal(true);
  readonly repliesSectionExpanded = signal(true);

  constructor() {
    const user = this.auth.currentUser();
    if (user) {
      this.load(user.id);
    }

    // The panel stays mounted, so refetch after post activity. skip(1): toObservable()
    // emits the current value at once, which the load() above already covers.
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

  /** `parent` tells resource-detail which thread to expand to reach a reply. */
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

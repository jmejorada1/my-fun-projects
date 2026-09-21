import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiConfigService } from '../core/api-config';
import { Page } from './page';
import { PostFlag } from './post-flag.service';

export interface Post {
  id: number;
  resourceId: number;
  userId: number;
  username: string;
  parentPostId: number | null;
  bodyText: string;
  data: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  /** Only populated by the list endpoints (top-level/replies/by-user); empty on create/update responses. */
  flags: PostFlag[];
  /** Same list-endpoints-only caveat as `flags` — 0 on create/update responses. */
  replyCount: number;
  /** Same list-endpoints-only caveat as `flags` — null on create/update responses. */
  resourceDisplayName: string | null;
}

export interface PostCreateRequest {
  username: string;
  resourceId: number;
  parentPostId?: number | null;
  bodyText: string;
  postTypeId?: number | null;
  score?: number | null;
  data?: Record<string, unknown> | null;
}

export interface PostCreateResponse {
  post: Post;
  flag: PostFlag | null;
}

/**
 * Backs the unified `POST /posts` (top-level posts and replies alike, via
 * an optional `parentPostId` — replies can carry a flag the same way top-
 * level posts do) and `GET /users/{userId}/posts` — see
 * backend/posts/docs/architecture.md §5 and design-spec.md §3.
 */
@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);

  listByUser(userId: number, page = 0, size = 20): Observable<Page<Post>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<Page<Post>>(`${this.apiConfig.baseUrl()}/users/${userId}/posts`, { params });
  }

  /** Top-level posts on a resource, i.e. its thread (design-spec.md §3, resource detail view). */
  listTopLevel(resourceId: number, page = 0, size = 20): Observable<Page<Post>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<Page<Post>>(`${this.apiConfig.baseUrl()}/resources/${resourceId}/posts`, { params });
  }

  /** Existing replies to a post, fetched lazily when a thread row is expanded. */
  listReplies(postId: number, page = 0, size = 50): Observable<Page<Post>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<Page<Post>>(`${this.apiConfig.baseUrl()}/posts/${postId}/replies`, { params });
  }

  create(request: PostCreateRequest): Observable<PostCreateResponse> {
    return this.http.post<PostCreateResponse>(`${this.apiConfig.baseUrl()}/posts`, request);
  }

  /**
   * Soft-deletes a post and, in the same backend transaction, its entire
   * reply subtree — including replies from other users, since the cascade
   * walks the parentPostId tree, not authorship. Owner-only: the backend
   * 403s if `userId` isn't the post's own author.
   */
  delete(postId: number, userId: number): Observable<void> {
    const headers = new HttpHeaders({ 'X-User-Id': String(userId) });
    return this.http.delete<void>(`${this.apiConfig.baseUrl()}/posts/${postId}`, { headers });
  }
}

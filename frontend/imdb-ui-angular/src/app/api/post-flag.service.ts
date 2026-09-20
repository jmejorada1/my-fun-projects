import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../core/api-config';

export interface PostType {
  id: number;
  name: string;
}

export interface PostFlag {
  id: number;
  postId: number;
  postType: PostType;
  score: number;
  createdAt: string;
  updatedAt: string;
}

export interface PostFlagCreateRequest {
  userId: number;
  postTypeId: number;
  score: number;
}

/** Backs POST/GET /posts/{postId}/flags — design-spec.md §4. */
@Injectable({ providedIn: 'root' })
export class PostFlagService {
  private readonly http = inject(HttpClient);

  addOrUpdate(postId: number, request: PostFlagCreateRequest): Observable<PostFlag> {
    return this.http.post<PostFlag>(`${API_BASE_URL}/posts/${postId}/flags`, request);
  }

  listActive(postId: number): Observable<PostFlag[]> {
    return this.http.get<PostFlag[]>(`${API_BASE_URL}/posts/${postId}/flags`);
  }
}

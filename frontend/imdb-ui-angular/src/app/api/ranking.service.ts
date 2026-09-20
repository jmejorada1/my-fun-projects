import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../core/api-config';
import { PostType } from './post-flag.service';

export interface RankingResourceSummary {
  id: number;
  name: string;
  displayName: string;
}

export interface RankedResource {
  resource: RankingResourceSummary;
  averageScore: number;
  flagCount: number;
}

export interface PostTypeRanking {
  postType: PostType;
  resources: RankedResource[];
}

/**
 * Backs `GET /rankings` — deliberately domain-agnostic on the backend side
 * (design-spec.md §3.5); this client just renders whatever post types come
 * back for the configured domain.
 */
@Injectable({ providedIn: 'root' })
export class RankingService {
  private readonly http = inject(HttpClient);

  getRankings(): Observable<PostTypeRanking[]> {
    return this.http.get<PostTypeRanking[]>(`${API_BASE_URL}/rankings`);
  }
}

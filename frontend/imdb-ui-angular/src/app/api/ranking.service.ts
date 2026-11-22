import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiConfigService } from '../core/api-config';
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

@Injectable({ providedIn: 'root' })
export class RankingService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);

  getRankings(): Observable<PostTypeRanking[]> {
    return this.http.get<PostTypeRanking[]>(`${this.apiConfig.baseUrl()}/rankings`);
  }
}

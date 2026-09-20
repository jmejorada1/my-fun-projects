import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../core/api-config';
import { Page } from './page';

export interface ResourceCategory {
  id: number;
  name: string;
  displayName: string;
}

export interface ResourceFlagSummaryEntry {
  postTypeName: string;
  averageScore: number;
  flagCount: number;
}

export interface Resource {
  id: number;
  name: string;
  displayName: string;
  category: ResourceCategory;
  createdAt: string;
  updatedAt: string;
  /** Only populated by the list/search endpoint; 0 on a single-resource GET. */
  postCount: number;
  /** Same list-endpoint-only caveat as `postCount` — empty on a single-resource GET. */
  flagSummary: ResourceFlagSummaryEntry[];
}

/** Backs GET /resources — design-spec.md §3.3 (search) and §5 (search panel). */
@Injectable({ providedIn: 'root' })
export class ResourceService {
  private readonly http = inject(HttpClient);

  search(term: string): Observable<Page<Resource>> {
    let params = new HttpParams();
    if (term) {
      params = params.set('search', term);
    }
    return this.http.get<Page<Resource>>(`${API_BASE_URL}/resources`, { params });
  }

  get(id: number): Observable<Resource> {
    return this.http.get<Resource>(`${API_BASE_URL}/resources/${id}`);
  }
}

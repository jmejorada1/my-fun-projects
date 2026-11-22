import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiConfigService } from '../core/api-config';
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
  /** Counts replies too. */
  postCount: number;
  /** Includes flags on replies. */
  flagSummary: ResourceFlagSummaryEntry[];
}

@Injectable({ providedIn: 'root' })
export class ResourceService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);

  search(term: string): Observable<Page<Resource>> {
    let params = new HttpParams();
    if (term) {
      params = params.set('search', term);
    }
    return this.http.get<Page<Resource>>(`${this.apiConfig.baseUrl()}/resources`, { params });
  }

  get(id: number): Observable<Resource> {
    return this.http.get<Resource>(`${this.apiConfig.baseUrl()}/resources/${id}`);
  }
}

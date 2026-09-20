import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../core/api-config';
import { PostType } from './post-flag.service';

/** Backs `GET /post-types` — used to populate the flag dropdown on a post form. */
@Injectable({ providedIn: 'root' })
export class PostTypeService {
  private readonly http = inject(HttpClient);

  listAll(): Observable<PostType[]> {
    return this.http.get<PostType[]>(`${API_BASE_URL}/post-types`);
  }
}

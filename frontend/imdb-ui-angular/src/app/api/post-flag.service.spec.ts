import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { PostFlagService } from './post-flag.service';
import { API_BASE_URL } from '../core/api-config';

describe('PostFlagService', () => {
  let service: PostFlagService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PostFlagService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('posts a flag to the right post', () => {
    service.addOrUpdate(5, { userId: 1, postTypeId: 2, score: 4 }).subscribe();

    const req = httpMock.expectOne(`${API_BASE_URL}/posts/5/flags`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 1, postTypeId: 2, score: 4 });
    req.flush({ id: 1, postId: 5, postType: { id: 2, name: 'racism' }, score: 4 });
  });

  it('lists active flags for a post', () => {
    service.listActive(5).subscribe();

    httpMock.expectOne(`${API_BASE_URL}/posts/5/flags`).flush([]);
  });
});

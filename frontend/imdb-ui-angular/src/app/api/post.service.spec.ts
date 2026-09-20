import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { PostService } from './post.service';
import { API_BASE_URL } from '../core/api-config';

describe('PostService', () => {
  let service: PostService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PostService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches a user\'s posts with pagination params', () => {
    service.listByUser(7, 1, 10).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${API_BASE_URL}/users/7/posts` &&
        r.params.get('page') === '1' &&
        r.params.get('size') === '10',
    );
    req.flush({ content: [], totalElements: 0, totalPages: 0, number: 1, size: 10 });
  });

  it('fetches a resource\'s top-level posts with pagination params', () => {
    service.listTopLevel(3, 0, 20).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${API_BASE_URL}/resources/3/posts` &&
        r.params.get('page') === '0' &&
        r.params.get('size') === '20',
    );
    req.flush({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
  });

  it('posts to the unified creation endpoint', () => {
    service
      .create({ username: 'jdoe', resourceId: 1, bodyText: 'hello' })
      .subscribe();

    const req = httpMock.expectOne(`${API_BASE_URL}/posts`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'jdoe', resourceId: 1, bodyText: 'hello' });
    req.flush({ post: { id: 1 }, flag: null });
  });

  it('sends the acting user as an X-User-Id header when deleting a post', () => {
    service.delete(42, 7).subscribe();

    const req = httpMock.expectOne(`${API_BASE_URL}/posts/42`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('X-User-Id')).toBe('7');
    req.flush(null);
  });
});

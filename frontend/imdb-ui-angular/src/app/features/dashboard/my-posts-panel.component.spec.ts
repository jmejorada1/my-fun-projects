import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { MyPostsPanelComponent } from './my-posts-panel.component';
import { API_BASE_URL } from '../../core/api-config';
import { errorInterceptor } from '../../core/error.interceptor';

describe('MyPostsPanelComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [MyPostsPanelComponent],
      providers: [provideHttpClient(withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('shows the empty state for a user with no posts', () => {
    localStorage.setItem(
      'imdb-ui-angular.currentUser',
      JSON.stringify({ id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null }),
    );

    const fixture = TestBed.createComponent(MyPostsPanelComponent);
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url === `${API_BASE_URL}/users/1/posts`)
      .flush({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
    fixture.detectChanges();

    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.posts()).toEqual([]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain("You haven't posted yet.");
    expect(text).toContain("You haven't replied to anything yet.");
  });

  it('splits top-level posts from replies by parentPostId, into separate sections', () => {
    localStorage.setItem(
      'imdb-ui-angular.currentUser',
      JSON.stringify({ id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null }),
    );

    const fixture = TestBed.createComponent(MyPostsPanelComponent);
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/users/1/posts`).flush({
      content: [
        { id: 1, resourceId: 1, userId: 1, username: 'jdoe', parentPostId: null, bodyText: 'A top-level post.', data: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
        { id: 2, resourceId: 2, userId: 1, username: 'jdoe', parentPostId: 42, bodyText: 'A reply.', data: null, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'The Shawshank Redemption' },
      ],
      totalElements: 2,
      totalPages: 1,
      number: 0,
      size: 20,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.topLevelPosts().map((p) => p.id)).toEqual([1]);
    expect(fixture.componentInstance.replies().map((p) => p.id)).toEqual([2]);

    // Groups are collapsed by default, but their movie-title headers (the
    // only thing distinguishing the two posts here) are always visible.
    const el = fixture.nativeElement as HTMLElement;
    const sections = el.querySelectorAll('section');
    expect(sections[0].textContent).toContain('Carmencita');
    expect(sections[0].textContent).not.toContain('The Shawshank Redemption');
    expect(sections[1].textContent).toContain('The Shawshank Redemption');
    expect(sections[1].textContent).not.toContain('Carmencita');
  });

  it("shows each post's movie title", () => {
    localStorage.setItem(
      'imdb-ui-angular.currentUser',
      JSON.stringify({ id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null }),
    );

    const fixture = TestBed.createComponent(MyPostsPanelComponent);
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/users/1/posts`).flush({
      content: [
        { id: 1, resourceId: 1, userId: 1, username: 'jdoe', parentPostId: null, bodyText: 'A top-level post.', data: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
        { id: 2, resourceId: 2, userId: 1, username: 'jdoe', parentPostId: 42, bodyText: 'A reply.', data: null, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'The Shawshank Redemption' },
      ],
      totalElements: 2,
      totalPages: 1,
      number: 0,
      size: 20,
    });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Carmencita');
    expect(text).toContain('The Shawshank Redemption');
  });

  it('groups posts by movie into a tree, collapsed by default', () => {
    localStorage.setItem(
      'imdb-ui-angular.currentUser',
      JSON.stringify({ id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null }),
    );

    const fixture = TestBed.createComponent(MyPostsPanelComponent);
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/users/1/posts`).flush({
      content: [
        { id: 1, resourceId: 1, userId: 1, username: 'jdoe', parentPostId: null, bodyText: 'First on Carmencita.', data: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
        { id: 2, resourceId: 1, userId: 1, username: 'jdoe', parentPostId: null, bodyText: 'Second on Carmencita.', data: null, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
      ],
      totalElements: 2,
      totalPages: 1,
      number: 0,
      size: 20,
    });
    fixture.detectChanges();

    const groups = fixture.componentInstance.topLevelGroups();
    expect(groups.length).toBe(1);
    expect(groups[0].resourceId).toBe(1);
    expect(groups[0].displayName).toBe('Carmencita');
    expect(groups[0].posts.map((p) => p.id)).toEqual([1, 2]);

    // Collapsed by default — the movie name and count show, but not the posts.
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.isPostGroupExpanded(1)).toBe(false);
    expect(el.textContent).toContain('Carmencita');
    expect(el.querySelector('.tree-count')?.textContent?.trim()).toBe('(2)');
    expect(el.textContent).not.toContain('First on Carmencita.');
    expect(el.textContent).not.toContain('Second on Carmencita.');
  });

  it('expands and re-collapses a movie group on click', () => {
    localStorage.setItem(
      'imdb-ui-angular.currentUser',
      JSON.stringify({ id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null }),
    );

    const fixture = TestBed.createComponent(MyPostsPanelComponent);
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/users/1/posts`).flush({
      content: [
        { id: 1, resourceId: 1, userId: 1, username: 'jdoe', parentPostId: null, bodyText: 'On Carmencita.', data: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
      ],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 20,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.isPostGroupExpanded(1)).toBe(false);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('On Carmencita.');

    (el.querySelector('.tree-toggle') as HTMLElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.isPostGroupExpanded(1)).toBe(true);
    expect(el.textContent).toContain('On Carmencita.');

    (el.querySelector('.tree-toggle') as HTMLElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.isPostGroupExpanded(1)).toBe(false);
    expect(el.textContent).not.toContain('On Carmencita.');
  });

  it('does not call the backend when no user is logged in', () => {
    const fixture = TestBed.createComponent(MyPostsPanelComponent);
    fixture.detectChanges();

    httpMock.expectNone(() => true);
    expect(fixture.componentInstance.posts()).toEqual([]);
  });

  it('surfaces an error message on failure', () => {
    localStorage.setItem(
      'imdb-ui-angular.currentUser',
      JSON.stringify({ id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null }),
    );
    const fixture = TestBed.createComponent(MyPostsPanelComponent);
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url === `${API_BASE_URL}/users/1/posts`)
      .flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.errorMessage()).toBe('boom');
  });
});

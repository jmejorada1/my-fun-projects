import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { of } from 'rxjs';
import { ResourceDetailComponent } from './resource-detail.component';
import { API_BASE_URL } from '../../core/api-config';
import { errorInterceptor } from '../../core/error.interceptor';

const RESOURCE = {
  id: 1,
  name: 'tt0000001',
  displayName: 'Carmencita',
  category: { id: 51, name: 'short', displayName: 'Short Film' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  postCount: 0,
  flagSummary: [],
};

const DEFAULT_TOP_LEVEL_POSTS = [
  {
    id: 42, resourceId: 1, userId: 9, username: 'other-user', parentPostId: null, bodyText: 'Existing post.', data: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    flags: [{ id: 1, postId: 42, postType: { id: 5, name: 'racism' }, score: 4, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
    replyCount: 1,
    resourceDisplayName: 'Carmencita',
  },
];

describe('ResourceDetailComponent', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  async function createComponent(
    topLevelPosts: unknown[] = DEFAULT_TOP_LEVEL_POSTS,
    postTypes: unknown[] = [{ id: 5, name: 'racism' }],
  ) {
    await TestBed.configureTestingModule({
      imports: [ResourceDetailComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '1' })) } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);

    localStorage.setItem(
      'imdb-ui-angular.currentUser',
      JSON.stringify({ id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null }),
    );

    const fixture = TestBed.createComponent(ResourceDetailComponent);
    fixture.detectChanges();

    httpMock.expectOne(`${API_BASE_URL}/post-types`).flush(postTypes);
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/resources/1`).flush(RESOURCE);
    httpMock
      .expectOne((r) => r.url === `${API_BASE_URL}/resources/1/posts`)
      .flush({
        content: topLevelPosts,
        totalElements: topLevelPosts.length,
        totalPages: 1,
        number: 0,
        size: 20,
      });
    fixture.detectChanges();

    return fixture;
  }

  beforeEach(() => localStorage.clear());

  afterEach(() => httpMock.verify());

  it('loads the resource and its posts for the id in the route', async () => {
    const fixture = await createComponent();

    expect(fixture.componentInstance.resource()?.displayName).toBe('Carmencita');
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.postTypes()).toEqual([{ id: 5, name: 'racism' }]);
    expect(fixture.componentInstance.posts().length).toBe(1);
  });

  it('displays the author\'s username, not "User #<id>"', async () => {
    const fixture = await createComponent();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('other-user');
    expect(text).not.toContain('User #');
  });

  it('displays a post\'s flagged category and severity score', async () => {
    const fixture = await createComponent();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('racism (4)');
  });

  it('colors a severity-4 flag badge red in the DOM', async () => {
    const fixture = await createComponent();

    const badge = (fixture.nativeElement as HTMLElement).querySelector('.flag-badge');
    expect(badge?.classList.contains('flag-badge--red')).toBe(true);
  });

  it('picks the right severity color class for each score band and for "no-bigotry"', async () => {
    const fixture = await createComponent();
    const c = fixture.componentInstance;

    expect(c.flagSeverityClass('racism', 0)).toBe('flag-badge--yellow');
    expect(c.flagSeverityClass('racism', 2)).toBe('flag-badge--yellow');
    expect(c.flagSeverityClass('racism', 3)).toBe('flag-badge--orange');
    expect(c.flagSeverityClass('racism', 4)).toBe('flag-badge--red');
    expect(c.flagSeverityClass('racism', 5)).toBe('flag-badge--red');
    expect(c.flagSeverityClass('no-bigotry', 0)).toBe('flag-badge--green');
  });

  it('summarizes flags per category, averaging severity except for "no-bigotry" (a count instead)', async () => {
    const fixture = await createComponent([
      {
        id: 1, resourceId: 1, userId: 1, username: 'a', parentPostId: null, bodyText: 'x', data: null,
        createdAt: '', updatedAt: '',
        flags: [
          { id: 1, postId: 1, postType: { id: 5, name: 'racism' }, score: 4, createdAt: '', updatedAt: '' },
          { id: 2, postId: 1, postType: { id: 6, name: 'no-bigotry' }, score: 0, createdAt: '', updatedAt: '' },
        ],
        replyCount: 0, resourceDisplayName: 'Carmencita',
      },
      {
        id: 2, resourceId: 1, userId: 1, username: 'b', parentPostId: null, bodyText: 'y', data: null,
        createdAt: '', updatedAt: '',
        flags: [
          { id: 3, postId: 2, postType: { id: 5, name: 'racism' }, score: 2, createdAt: '', updatedAt: '' },
          { id: 4, postId: 2, postType: { id: 6, name: 'no-bigotry' }, score: 0, createdAt: '', updatedAt: '' },
        ],
        replyCount: 0, resourceDisplayName: 'Carmencita',
      },
    ]);

    expect(fixture.componentInstance.categorySummary()).toEqual([
      { name: 'no-bigotry', count: 2, averageScore: null },
      { name: 'racism', count: 2, averageScore: 3 },
    ]);

    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.summary-card'));
    expect(cards.length).toBe(2);
    expect(cards[0].querySelector('.summary-value')?.textContent?.trim()).toBe('2');
    expect(cards[0].textContent).not.toContain('avg');
    expect(cards[1].textContent).toContain('avg 3.0');
    expect(cards[1].textContent).toContain('2 flags');
  });

  it('hides the flag summary section when the movie has no flags at all', async () => {
    const fixture = await createComponent([
      { id: 1, resourceId: 1, userId: 1, username: 'a', parentPostId: null, bodyText: 'x', data: null, createdAt: '', updatedAt: '', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
    ]);

    expect(fixture.componentInstance.categorySummary()).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.flag-summary')).toBeNull();
  });

  it('shows the expand caret and reply count when a post has replies', async () => {
    const fixture = await createComponent();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.expand-icon')).toBeTruthy();
    expect(el.querySelector('.reply-count')?.textContent?.trim()).toBe('1');
  });

  it('hides the expand caret entirely when a post has no replies', async () => {
    const fixture = await createComponent([
      {
        id: 43, resourceId: 1, userId: 9, username: 'other-user', parentPostId: null, bodyText: 'No replies yet.', data: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
        flags: [], replyCount: 0, resourceDisplayName: 'Carmencita',
      },
    ]);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.expand-icon')).toBeNull();
    expect(el.querySelector('.reply-count')).toBeNull();
  });

  it('auto-fills severity to 0 and hides the picker when "No Bigotry" is selected', async () => {
    const fixture = await createComponent([], [{ id: 5, name: 'racism' }, { id: 6, name: 'no-bigotry' }]);

    fixture.componentInstance.form.controls.postTypeId.setValue(6);
    fixture.detectChanges();

    expect(fixture.componentInstance.isNoBigotrySelected()).toBe(true);
    expect(fixture.componentInstance.form.controls.score.value).toBe(0);
    expect(fixture.componentInstance.form.controls.score.disabled).toBe(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Severity is automatically set to 0');
    expect(el.querySelector('select[formControlName="score"]')).toBeNull();

    fixture.componentInstance.form.controls.bodyText.setValue('Nothing wrong here.');
    fixture.componentInstance.submit();

    const req = httpMock.expectOne(`${API_BASE_URL}/posts`);
    expect(req.request.body).toEqual({
      username: 'jdoe',
      resourceId: 1,
      bodyText: 'Nothing wrong here.',
      postTypeId: 6,
      score: 0,
    });
  });

  it('resets the locked score when switching away from "No Bigotry"', async () => {
    const fixture = await createComponent([], [{ id: 5, name: 'racism' }, { id: 6, name: 'no-bigotry' }]);

    fixture.componentInstance.form.controls.postTypeId.setValue(6);
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.score.value).toBe(0);

    fixture.componentInstance.form.controls.postTypeId.setValue(5);
    fixture.detectChanges();

    expect(fixture.componentInstance.isNoBigotrySelected()).toBe(false);
    expect(fixture.componentInstance.form.controls.score.disabled).toBe(false);
    expect(fixture.componentInstance.form.controls.score.value).toBeNull();
  });

  it('hides "No Bigotry" from the category dropdown when the movie has a flag with severity >= 3', async () => {
    // DEFAULT_TOP_LEVEL_POSTS carries a racism flag scored 4.
    const fixture = await createComponent(undefined, [{ id: 5, name: 'racism' }, { id: 6, name: 'no-bigotry' }]);

    expect(fixture.componentInstance.hasSevereFlag()).toBe(true);
    expect(fixture.componentInstance.visiblePostTypes().map((t) => t.name)).toEqual(['racism']);
    const options = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('select[formControlName="postTypeId"] option'),
    ).map((o) => o.textContent?.trim());
    expect(options).not.toContain('no-bigotry');
  });

  it('shows "No Bigotry" in the category dropdown when the movie has no severe flags', async () => {
    const fixture = await createComponent([], [{ id: 5, name: 'racism' }, { id: 6, name: 'no-bigotry' }]);

    expect(fixture.componentInstance.hasSevereFlag()).toBe(false);
    expect(fixture.componentInstance.visiblePostTypes().map((t) => t.name)).toEqual(['racism', 'no-bigotry']);
  });

  it('clears an already-selected "No Bigotry" if a new severe flag makes it newly ineligible', async () => {
    const fixture = await createComponent([], [{ id: 5, name: 'racism' }, { id: 6, name: 'no-bigotry' }]);

    fixture.componentInstance.form.controls.postTypeId.setValue(6);
    fixture.detectChanges();
    expect(fixture.componentInstance.isNoBigotrySelected()).toBe(true);

    // Simulate a severe flag having just been loaded/added for this movie.
    fixture.componentInstance.posts.set([
      { id: 99, resourceId: 1, userId: 1, username: 'jdoe', parentPostId: null, bodyText: 'Bad.', data: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', flags: [{ id: 2, postId: 99, postType: { id: 5, name: 'racism' }, score: 5, createdAt: '', updatedAt: '' }], replyCount: 0, resourceDisplayName: 'Carmencita' },
    ]);
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedPostTypeId()).toBeNull();
    expect(fixture.componentInstance.isNoBigotrySelected()).toBe(false);
  });

  it('rejects a category without a score', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.form.setValue({ bodyText: 'hello', postTypeId: 5, score: null });

    fixture.componentInstance.submit();

    httpMock.expectNone((r) => r.url === `${API_BASE_URL}/posts`);
    expect(fixture.componentInstance.submitError()).toContain('together');
  });

  it('creates a top-level post via the unified endpoint and stays on the page, showing it immediately', async () => {
    const fixture = await createComponent();
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    fixture.componentInstance.form.setValue({ bodyText: 'Worth flagging.', postTypeId: 5, score: 4 });

    fixture.componentInstance.submit();

    const req = httpMock.expectOne(`${API_BASE_URL}/posts`);
    expect(req.request.body).toEqual({
      username: 'jdoe',
      resourceId: 1,
      bodyText: 'Worth flagging.',
      postTypeId: 5,
      score: 4,
    });
    req.flush({
      post: { id: 99, resourceId: 1, userId: 1, username: 'jdoe', parentPostId: null, bodyText: 'Worth flagging.', data: null, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
      flag: { id: 1, postId: 99, postType: { id: 5, name: 'racism' }, score: 4 },
    });
    fixture.detectChanges();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.submitting()).toBe(false);
    const newPost = fixture.componentInstance.posts().find((p) => p.id === 99);
    expect(newPost?.flags).toEqual([{ id: 1, postId: 99, postType: { id: 5, name: 'racism' }, score: 4 }]);
    expect(fixture.componentInstance.form.value.bodyText).toBe('');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Worth flagging.');
  });

  it('treats score 0 (neutral) as provided, not as missing', async () => {
    // Regression guard: the pairing check must compare against null, not
    // truthiness — `0` is a valid, falsy score (design-spec.md decision #12
    // equivalent on the backend) and must not be rejected as "missing."
    const fixture = await createComponent();
    fixture.componentInstance.form.setValue({ bodyText: 'Neutral on this one.', postTypeId: 5, score: 0 });

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.submitError()).toBeNull();
    const req = httpMock.expectOne(`${API_BASE_URL}/posts`);
    expect(req.request.body).toEqual({
      username: 'jdoe',
      resourceId: 1,
      bodyText: 'Neutral on this one.',
      postTypeId: 5,
      score: 0,
    });
    req.flush({
      post: { id: 101, resourceId: 1, userId: 1, username: 'jdoe', parentPostId: null, bodyText: 'Neutral on this one.', data: null, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
      flag: { id: 2, postId: 101, postType: { id: 5, name: 'racism' }, score: 0 },
    });
  });

  it('creates a plain top-level post with no flag when neither field is set', async () => {
    const fixture = await createComponent();
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    fixture.componentInstance.form.setValue({ bodyText: 'Just a comment.', postTypeId: null, score: null });

    fixture.componentInstance.submit();

    const req = httpMock.expectOne(`${API_BASE_URL}/posts`);
    expect(req.request.body).toEqual({ username: 'jdoe', resourceId: 1, bodyText: 'Just a comment.' });
    req.flush({
      post: { id: 100, resourceId: 1, userId: 1, username: 'jdoe', parentPostId: null, bodyText: 'Just a comment.', data: null, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
      flag: null,
    });

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.posts().find((p) => p.id === 100)?.flags).toEqual([]);
  });

  it('posts a reply to an existing post and stays on the page — no navigation', async () => {
    const fixture = await createComponent();
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    fixture.componentInstance.toggleReply(42);
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/posts/42/replies` && r.method === 'GET').flush({
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0,
      size: 50,
    });
    fixture.componentInstance.getReplyControl(42).setValue('I agree.');
    fixture.componentInstance.submitReply(42);

    const req = httpMock.expectOne(`${API_BASE_URL}/posts/42/replies`);
    expect(req.request.body).toEqual({ userId: 1, bodyText: 'I agree.' });
    req.flush({
      id: 200,
      resourceId: 1,
      userId: 1,
      username: 'jdoe',
      parentPostId: 42,
      bodyText: 'I agree.',
      data: null,
      createdAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      flags: [],
      replyCount: 0,
      resourceDisplayName: 'Carmencita',
    });

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.repliesFor(42).length).toBe(1);
    expect(fixture.componentInstance.repliesFor(42)[0].bodyText).toBe('I agree.');
    // The reply form collapses back after a successful post.
    expect(fixture.componentInstance.openReplyPostId()).toBeNull();
  });

  it('does not submit an empty reply', async () => {
    const fixture = await createComponent();

    fixture.componentInstance.toggleReply(42);
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/posts/42/replies` && r.method === 'GET').flush({
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0,
      size: 50,
    });
    fixture.componentInstance.submitReply(42);

    httpMock.expectNone((r) => r.url === `${API_BASE_URL}/posts/42/replies` && r.method === 'POST');
  });

  it('expanding a post row fetches and displays its existing replies', async () => {
    const fixture = await createComponent();

    fixture.componentInstance.toggleExpand(42);
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/posts/42/replies` && r.method === 'GET').flush({
      content: [
        { id: 7, resourceId: 1, userId: 3, username: 'someone-else', parentPostId: 42, bodyText: 'Nested reply.', data: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
      ],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 50,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.isExpanded(42)).toBe(true);
    expect(fixture.componentInstance.repliesFor(42).length).toBe(1);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Nested reply.');

    // Collapsing and re-expanding must not re-fetch — already loaded.
    fixture.componentInstance.toggleExpand(42);
    fixture.componentInstance.toggleExpand(42);
    httpMock.expectNone((r) => r.url === `${API_BASE_URL}/posts/42/replies`);
  });
});

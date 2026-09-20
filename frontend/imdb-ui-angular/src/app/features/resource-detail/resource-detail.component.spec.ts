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
import { PostActivityService } from '../../core/post-activity.service';

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

  it('always shows "No Bigotry" in the category dropdown, even when the movie has a severe flag', async () => {
    // DEFAULT_TOP_LEVEL_POSTS carries a racism flag scored 4 — "No Bigotry"
    // must still be selectable; only the rankings panel excludes a movie
    // from its own "No Bigotry" ranking for having a severe flag elsewhere.
    const fixture = await createComponent(undefined, [{ id: 5, name: 'racism' }, { id: 6, name: 'no-bigotry' }]);

    const options = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('select[formControlName="postTypeId"] option'),
    ).map((o) => o.textContent?.trim());
    expect(options).toContain('no-bigotry');
  });

  it('requires a category to be picked before submitting', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.form.setValue({ bodyText: 'hello', postTypeId: null, score: null });

    fixture.componentInstance.submit();

    httpMock.expectNone((r) => r.url === `${API_BASE_URL}/posts`);
    expect(fixture.componentInstance.form.invalid).toBe(true);
  });

  it('requires a severity to be picked once a (non-"No Bigotry") category is chosen', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.form.setValue({ bodyText: 'hello', postTypeId: 5, score: null });

    fixture.componentInstance.submit();

    httpMock.expectNone((r) => r.url === `${API_BASE_URL}/posts`);
    expect(fixture.componentInstance.form.invalid).toBe(true);
  });

  it('rejects a whitespace-only post body', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.form.setValue({ bodyText: '   ', postTypeId: 5, score: 4 });

    fixture.componentInstance.submit();

    httpMock.expectNone((r) => r.url === `${API_BASE_URL}/posts`);
    expect(fixture.componentInstance.form.controls.bodyText.invalid).toBe(true);
  });

  it('trims the post body before sending it to the backend', async () => {
    const fixture = await createComponent();
    fixture.componentInstance.form.setValue({ bodyText: '  Worth flagging.  ', postTypeId: 5, score: 4 });

    fixture.componentInstance.submit();

    const req = httpMock.expectOne(`${API_BASE_URL}/posts`);
    expect(req.request.body.bodyText).toBe('Worth flagging.');
    req.flush({
      post: { id: 99, resourceId: 1, userId: 1, username: 'jdoe', parentPostId: null, bodyText: 'Worth flagging.', data: null, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
      flag: { id: 1, postId: 99, postType: { id: 5, name: 'racism' }, score: 4 },
    });
  });

  it('shows inline errors only after a blocked submit attempt, and clears them once fixed', async () => {
    const fixture = await createComponent([], []);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).not.toContain('Write something before posting.');
    expect(el.textContent).not.toContain('Choose a category.');

    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(el.textContent).toContain('Write something before posting.');
    expect(el.textContent).toContain('Choose a category.');

    fixture.componentInstance.form.controls.bodyText.setValue('Now filled in.');
    fixture.detectChanges();

    expect(el.textContent).not.toContain('Write something before posting.');
    // Category is still unset — that error should remain.
    expect(el.textContent).toContain('Choose a category.');
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
    // Regression guard: Validators.required must not treat a valid, falsy
    // `0` score as "missing" (design-spec.md decision #12 equivalent on the
    // backend) the way a naive truthiness check would.
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

  it('focuses the reply textarea when the reply form opens', async () => {
    const fixture = await createComponent();

    fixture.componentInstance.toggleReply(42);
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/posts/42/replies` && r.method === 'GET').flush({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 50,
    });
    fixture.detectChanges();

    const textarea = (fixture.nativeElement as HTMLElement).querySelector('.reply-form textarea');
    expect(document.activeElement).toBe(textarea);
  });

  it('closes the reply form via the "Cancel Reply" button', async () => {
    const fixture = await createComponent();

    fixture.componentInstance.toggleReply(42);
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/posts/42/replies` && r.method === 'GET').flush({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 50,
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.reply-form')).toBeTruthy();

    (el.querySelector('.cancel-reply-button') as HTMLElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.openReplyPostId()).toBeNull();
    expect(el.querySelector('.reply-form')).toBeNull();
  });

  it('bumps replyCount locally so the expand caret appears without a page reload', async () => {
    const fixture = await createComponent([
      {
        id: 43, resourceId: 1, userId: 9, username: 'other-user', parentPostId: null, bodyText: 'No replies yet.', data: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
        flags: [], replyCount: 0, resourceDisplayName: 'Carmencita',
      },
    ]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.expand-icon')).toBeNull();

    fixture.componentInstance.toggleReply(43);
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/posts/43/replies` && r.method === 'GET').flush({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 50,
    });
    fixture.componentInstance.getReplyControl(43).setValue('First reply.');
    fixture.componentInstance.submitReply(43);
    httpMock.expectOne(`${API_BASE_URL}/posts/43/replies`).flush({
      id: 201, resourceId: 1, userId: 1, username: 'jdoe', parentPostId: 43, bodyText: 'First reply.', data: null,
      createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita',
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.posts().find((p) => p.id === 43)?.replyCount).toBe(1);
    expect(el.querySelector('.expand-icon')).toBeTruthy();
    expect(el.querySelector('.reply-count')?.textContent?.trim()).toBe('1');
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

  it('does not submit a whitespace-only reply', async () => {
    const fixture = await createComponent();

    fixture.componentInstance.toggleReply(42);
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/posts/42/replies` && r.method === 'GET').flush({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 50,
    });
    fixture.componentInstance.getReplyControl(42).setValue('   ');
    fixture.componentInstance.submitReply(42);

    httpMock.expectNone((r) => r.url === `${API_BASE_URL}/posts/42/replies` && r.method === 'POST');
    expect(fixture.componentInstance.isReplyInvalid(42)).toBe(true);
  });

  it('trims a reply before sending it to the backend', async () => {
    const fixture = await createComponent();

    fixture.componentInstance.toggleReply(42);
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/posts/42/replies` && r.method === 'GET').flush({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 50,
    });
    fixture.componentInstance.getReplyControl(42).setValue('  I agree.  ');
    fixture.componentInstance.submitReply(42);

    const req = httpMock.expectOne((r) => r.url === `${API_BASE_URL}/posts/42/replies` && r.method === 'POST');
    expect(req.request.body.bodyText).toBe('I agree.');
  });

  it('shows the reply error inline only after a blocked submit attempt', async () => {
    const fixture = await createComponent();

    fixture.componentInstance.toggleReply(42);
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/posts/42/replies` && r.method === 'GET').flush({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 50,
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Write something before posting a reply.');

    fixture.componentInstance.submitReply(42);
    fixture.detectChanges();
    expect(el.textContent).toContain('Write something before posting a reply.');

    fixture.componentInstance.getReplyControl(42).setValue('Now filled in.');
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Write something before posting a reply.');
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

  describe('sorting the posts table', () => {
    const SORT_TEST_POSTS = [
      {
        id: 1, resourceId: 1, userId: 1, username: 'zed', parentPostId: null, bodyText: 'Middle post.', data: null,
        createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
        flags: [{ id: 1, postId: 1, postType: { id: 5, name: 'sexism' }, score: 2, createdAt: '', updatedAt: '' }],
        replyCount: 0, resourceDisplayName: 'Carmencita',
      },
      {
        id: 2, resourceId: 1, userId: 2, username: 'amy', parentPostId: null, bodyText: 'Oldest post.', data: null,
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
        flags: [],
        replyCount: 0, resourceDisplayName: 'Carmencita',
      },
      {
        id: 3, resourceId: 1, userId: 3, username: 'mo', parentPostId: null, bodyText: 'Newest post.', data: null,
        createdAt: '2026-01-03T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z',
        flags: [{ id: 2, postId: 3, postType: { id: 6, name: 'racism' }, score: 4, createdAt: '', updatedAt: '' }],
        replyCount: 0, resourceDisplayName: 'Carmencita',
      },
    ];

    it('defaults to newest-first by "Posted", matching the toolbar indicator', async () => {
      const fixture = await createComponent(SORT_TEST_POSTS);
      const c = fixture.componentInstance;

      expect(c.sortColumn()).toBe('posted');
      expect(c.sortDirection()).toBe('desc');
      expect(c.sortedPosts().map((p) => p.id)).toEqual([3, 1, 2]);
      expect(c.ariaSortFor('posted')).toBe('descending');
      expect(c.ariaSortFor('author')).toBe('none');
    });

    it('sorts by author A-Z on first click, then reverses on a second click of the same column', async () => {
      const fixture = await createComponent(SORT_TEST_POSTS);
      const c = fixture.componentInstance;

      c.setSort('author');
      expect(c.sortDirection()).toBe('asc');
      expect(c.sortedPosts().map((p) => p.username)).toEqual(['amy', 'mo', 'zed']);

      c.setSort('author');
      expect(c.sortDirection()).toBe('desc');
      expect(c.sortedPosts().map((p) => p.username)).toEqual(['zed', 'mo', 'amy']);
    });

    it('sorts by post body text A-Z', async () => {
      const fixture = await createComponent(SORT_TEST_POSTS);
      const c = fixture.componentInstance;

      c.setSort('post');
      expect(c.sortedPosts().map((p) => p.bodyText)).toEqual(['Middle post.', 'Newest post.', 'Oldest post.']);
    });

    it('sorts by category, unflagged posts first, ties broken by score', async () => {
      const fixture = await createComponent(SORT_TEST_POSTS);
      const c = fixture.componentInstance;

      c.setSort('category');
      // amy: no flag: racism (id 3): sexism (id 1) — alphabetical, unflagged first.
      expect(c.sortedPosts().map((p) => p.id)).toEqual([2, 3, 1]);
    });

    it('switching to a new column resets direction to that column\'s default, not the previous direction', async () => {
      const fixture = await createComponent(SORT_TEST_POSTS);
      const c = fixture.componentInstance;

      c.setSort('author'); // asc
      c.setSort('posted'); // switching column — should default to desc, not inherit asc
      expect(c.sortDirection()).toBe('desc');
      expect(c.sortedPosts().map((p) => p.id)).toEqual([3, 1, 2]);
    });

    it('renders table rows in the sorted order', async () => {
      const fixture = await createComponent(SORT_TEST_POSTS);
      fixture.componentInstance.setSort('post');
      fixture.detectChanges();

      const bodies = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.post-row .body-col'),
      ).map((el) => el.textContent?.trim());
      expect(bodies).toEqual(['Middle post.', 'Newest post.', 'Oldest post.']);
    });
  });

  describe('long post bodies', () => {
    const LONG_BODY = 'x'.repeat(200);

    it('shows a "… more" toggle only for posts over the length threshold', async () => {
      const fixture = await createComponent([
        { id: 1, resourceId: 1, userId: 1, username: 'a', parentPostId: null, bodyText: LONG_BODY, data: null, createdAt: '', updatedAt: '', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
        { id: 2, resourceId: 1, userId: 1, username: 'b', parentPostId: null, bodyText: 'short.', data: null, createdAt: '', updatedAt: '', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
      ]);

      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('… more');
      expect(fixture.componentInstance.isLongPost(LONG_BODY)).toBe(true);
      expect(fixture.componentInstance.isLongPost('short.')).toBe(false);
    });

    it('expands and re-collapses a post body without affecting other posts', async () => {
      const fixture = await createComponent([
        { id: 1, resourceId: 1, userId: 1, username: 'a', parentPostId: null, bodyText: LONG_BODY, data: null, createdAt: '', updatedAt: '', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
      ]);
      const c = fixture.componentInstance;

      expect(c.isBodyExpanded(1)).toBe(false);
      c.toggleBodyExpand(1);
      expect(c.isBodyExpanded(1)).toBe(true);
      expect(c.isBodyExpanded(2)).toBe(false);
      c.toggleBodyExpand(1);
      expect(c.isBodyExpanded(1)).toBe(false);
    });

    it('clicking the toggle does not also expand the row\'s reply thread', async () => {
      const fixture = await createComponent([
        { id: 1, resourceId: 1, userId: 1, username: 'a', parentPostId: null, bodyText: LONG_BODY, data: null, createdAt: '', updatedAt: '', flags: [], replyCount: 1, resourceDisplayName: 'Carmencita' },
      ]);

      const toggle = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
        (b) => b.textContent?.includes('more'),
      ) as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.isBodyExpanded(1)).toBe(true);
      expect(fixture.componentInstance.isExpanded(1)).toBe(false);
    });

    it('lowers the truncation threshold as the Post column narrows', async () => {
      const fixture = await createComponent();
      const c = fixture.componentInstance;
      const midLengthText = 'y'.repeat(120);

      c.postColumnWidth.set(320);
      expect(c.isLongPost(midLengthText)).toBe(false);

      c.postColumnWidth.set(160);
      expect(c.isLongPost(midLengthText)).toBe(true);
    });
  });

  describe('resizing the Post column', () => {
    beforeEach(() => localStorage.removeItem('imdb-ui-angular.post-column-width'));

    it('drag-resizes the column and persists the width', async () => {
      const fixture = await createComponent();
      const resizer = (fixture.nativeElement as HTMLElement).querySelector('.col-resizer') as HTMLElement;

      // MouseEvent, not PointerEvent — jsdom doesn't implement pointer
      // capture, and the component's (pointerdown) binding fires for any
      // native "pointerdown"-named event regardless of its concrete type.
      resizer.dispatchEvent(new MouseEvent('pointerdown', { clientX: 320, bubbles: true }));
      resizer.dispatchEvent(new MouseEvent('pointermove', { clientX: 420, bubbles: true }));
      resizer.dispatchEvent(new MouseEvent('pointerup', { clientX: 420, bubbles: true }));
      fixture.detectChanges();

      expect(fixture.componentInstance.postColumnWidth()).toBe(420);
      const postTh = (fixture.nativeElement as HTMLElement).querySelector('.post-th') as HTMLElement;
      expect(postTh.style.width).toBe('420px');
      expect(localStorage.getItem('imdb-ui-angular.post-column-width')).toBe('420');
    });

    it('clamps drag-resize to the min/max column width', async () => {
      const fixture = await createComponent();
      const resizer = (fixture.nativeElement as HTMLElement).querySelector('.col-resizer') as HTMLElement;

      resizer.dispatchEvent(new MouseEvent('pointerdown', { clientX: 320, bubbles: true }));
      resizer.dispatchEvent(new MouseEvent('pointermove', { clientX: -1000, bubbles: true }));
      resizer.dispatchEvent(new MouseEvent('pointerup', { clientX: -1000, bubbles: true }));

      expect(fixture.componentInstance.postColumnWidth()).toBe(160); // MIN_POST_COLUMN_PX
    });

    it('resizes via arrow keys on the handle and persists the result', async () => {
      const fixture = await createComponent();
      const c = fixture.componentInstance;
      const startWidth = c.postColumnWidth();

      c.onColumnResizeKeydown({ key: 'ArrowRight', preventDefault: () => {} } as KeyboardEvent);
      expect(c.postColumnWidth()).toBe(startWidth + 20);
      expect(localStorage.getItem('imdb-ui-angular.post-column-width')).toBe(String(startWidth + 20));

      c.onColumnResizeKeydown({ key: 'ArrowLeft', preventDefault: () => {} } as KeyboardEvent);
      expect(c.postColumnWidth()).toBe(startWidth);
    });

    it('restores a previously persisted width on load', async () => {
      localStorage.setItem('imdb-ui-angular.post-column-width', '500');
      const fixture = await createComponent();

      expect(fixture.componentInstance.postColumnWidth()).toBe(500);
    });
  });

  describe('notifying the side panels', () => {
    it('notifies PostActivityService after creating a top-level post', async () => {
      const fixture = await createComponent();
      const notifySpy = vi.spyOn(TestBed.inject(PostActivityService), 'notifyPostOrReplyCreated');
      fixture.componentInstance.form.setValue({ bodyText: 'Worth flagging.', postTypeId: 5, score: 4 });

      fixture.componentInstance.submit();
      httpMock.expectOne(`${API_BASE_URL}/posts`).flush({
        post: { id: 99, resourceId: 1, userId: 1, username: 'jdoe', parentPostId: null, bodyText: 'Worth flagging.', data: null, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita' },
        flag: { id: 1, postId: 99, postType: { id: 5, name: 'racism' }, score: 4 },
      });

      expect(notifySpy).toHaveBeenCalledTimes(1);
    });

    it('notifies PostActivityService after posting a reply', async () => {
      const fixture = await createComponent();
      const notifySpy = vi.spyOn(TestBed.inject(PostActivityService), 'notifyPostOrReplyCreated');

      fixture.componentInstance.toggleReply(42);
      httpMock.expectOne((r) => r.url === `${API_BASE_URL}/posts/42/replies` && r.method === 'GET').flush({
        content: [], totalElements: 0, totalPages: 0, number: 0, size: 50,
      });
      fixture.componentInstance.getReplyControl(42).setValue('I agree.');
      fixture.componentInstance.submitReply(42);
      httpMock.expectOne(`${API_BASE_URL}/posts/42/replies`).flush({
        id: 200, resourceId: 1, userId: 1, username: 'jdoe', parentPostId: 42, bodyText: 'I agree.', data: null,
        createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', flags: [], replyCount: 0, resourceDisplayName: 'Carmencita',
      });

      expect(notifySpy).toHaveBeenCalledTimes(1);
    });

    it('does not notify on a failed post submission', async () => {
      const fixture = await createComponent();
      const notifySpy = vi.spyOn(TestBed.inject(PostActivityService), 'notifyPostOrReplyCreated');
      fixture.componentInstance.form.setValue({ bodyText: 'Worth flagging.', postTypeId: 5, score: 4 });

      fixture.componentInstance.submit();
      httpMock.expectOne(`${API_BASE_URL}/posts`).flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(notifySpy).not.toHaveBeenCalled();
    });
  });
});

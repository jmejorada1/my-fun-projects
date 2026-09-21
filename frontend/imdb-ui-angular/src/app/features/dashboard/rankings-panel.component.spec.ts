import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { RankingsPanelComponent } from './rankings-panel.component';
import { API_BASE_URL } from '../../core/api-config';
import { errorInterceptor } from '../../core/error.interceptor';
import { PostActivityService } from '../../core/post-activity.service';
import { DomainSelectionService } from '../../core/domain-selection.service';
import { DOMAIN_OPTIONS_TOKEN } from '../../core/domain-options';

// imdb-standard.config.ts ships with enabled: false (flips true once
// backend seed data exists — plan §11 Phase 2b); this override makes it
// selectable purely for these tests, same pattern
// domain-selection.service.spec.ts already uses.
const BOTH_DOMAINS_ENABLED = [
  { value: 'imdb/bigotry', label: 'Big-O-Meter', enabled: true, description: 'Bigotry flagging.' },
  { value: 'imdb/standard', label: 'Movie-Meter', enabled: true, description: 'Standard ratings.' },
];

describe('RankingsPanelComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RankingsPanelComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads rankings once on creation, including post types with no flags', () => {
    const fixture = TestBed.createComponent(RankingsPanelComponent);

    httpMock.expectOne(`${API_BASE_URL}/rankings`).flush([
      {
        postType: { id: 1, name: 'racism' },
        resources: [{ resource: { id: 1, name: 'tt1', displayName: 'A Movie' }, averageScore: 4.5, flagCount: 2 }],
      },
      { postType: { id: 2, name: 'sexism' }, resources: [] },
    ]);

    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.rankings().length).toBe(2);
    expect(fixture.componentInstance.rankings()[1].resources).toEqual([]);
  });

  it('excludes a "No Bigotry"-ranked movie that has a severe flag in another category', () => {
    const fixture = TestBed.createComponent(RankingsPanelComponent);

    httpMock.expectOne(`${API_BASE_URL}/rankings`).flush([
      {
        postType: { id: 1, name: 'no-bigotry' },
        resources: [
          { resource: { id: 401, name: 'tt1', displayName: 'Carmencita' }, averageScore: 0, flagCount: 2 },
          { resource: { id: 451, name: 'tt2', displayName: 'A Clean Movie' }, averageScore: 0, flagCount: 1 },
        ],
      },
    ]);

    // Carmencita: one of its posts carries an unrelated racism flag scored 4.
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/resources/401/posts`).flush({
      content: [
        {
          id: 1, resourceId: 401, userId: 1, username: 'a', parentPostId: null, bodyText: 'x', data: null,
          createdAt: '', updatedAt: '',
          flags: [{ id: 1, postId: 1, postType: { id: 2, name: 'racism' }, score: 4, createdAt: '', updatedAt: '' }],
          replyCount: 0, resourceDisplayName: 'Carmencita',
        },
      ],
      totalElements: 1, totalPages: 1, number: 0, size: 200,
    });
    // A Clean Movie: no severe flags anywhere.
    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/resources/451/posts`).flush({
      content: [
        {
          id: 2, resourceId: 451, userId: 1, username: 'a', parentPostId: null, bodyText: 'y', data: null,
          createdAt: '', updatedAt: '',
          flags: [{ id: 2, postId: 2, postType: { id: 1, name: 'no-bigotry' }, score: 0, createdAt: '', updatedAt: '' }],
          replyCount: 0, resourceDisplayName: 'A Clean Movie',
        },
      ],
      totalElements: 1, totalPages: 1, number: 0, size: 200,
    });

    expect(fixture.componentInstance.rankings().length).toBe(1);
    expect(fixture.componentInstance.rankings()[0].resources.map((r) => r.resource.displayName)).toEqual([
      'A Clean Movie',
    ]);
  });

  it('hides the "No Bigotry" category entirely once every candidate is filtered out', () => {
    const fixture = TestBed.createComponent(RankingsPanelComponent);

    httpMock.expectOne(`${API_BASE_URL}/rankings`).flush([
      { postType: { id: 2, name: 'racism' }, resources: [] },
      {
        postType: { id: 1, name: 'no-bigotry' },
        resources: [{ resource: { id: 401, name: 'tt1', displayName: 'Carmencita' }, averageScore: 0, flagCount: 1 }],
      },
    ]);

    httpMock.expectOne((r) => r.url === `${API_BASE_URL}/resources/401/posts`).flush({
      content: [
        {
          id: 1, resourceId: 401, userId: 1, username: 'a', parentPostId: null, bodyText: 'x', data: null,
          createdAt: '', updatedAt: '',
          flags: [{ id: 1, postId: 1, postType: { id: 2, name: 'racism' }, score: 5, createdAt: '', updatedAt: '' }],
          replyCount: 0, resourceDisplayName: 'Carmencita',
        },
      ],
      totalElements: 1, totalPages: 1, number: 0, size: 200,
    });

    expect(fixture.componentInstance.rankings().map((r) => r.postType.name)).toEqual(['racism']);
  });

  it('surfaces an error message on failure', () => {
    const fixture = TestBed.createComponent(RankingsPanelComponent);

    httpMock
      .expectOne(`${API_BASE_URL}/rankings`)
      .flush({ detail: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.errorMessage()).toBe('boom');
  });

  it('refetches when notified of a new post/reply elsewhere in the app', () => {
    const fixture = TestBed.createComponent(RankingsPanelComponent);
    // Flushes toObservable()'s initial replay of the signal's current value
    // — otherwise it and the real change below would coalesce into a single
    // effect run by the time the first tick() happens, and skip(1) would
    // swallow the wrong (only) emission.
    TestBed.tick();

    httpMock.expectOne(`${API_BASE_URL}/rankings`).flush([{ postType: { id: 1, name: 'racism' }, resources: [] }]);
    expect(fixture.componentInstance.rankings()[0].resources).toEqual([]);

    TestBed.inject(PostActivityService).notifyPostOrReplyCreated();
    TestBed.tick(); // flush the effect toObservable() uses internally

    httpMock.expectOne(`${API_BASE_URL}/rankings`).flush([
      {
        postType: { id: 1, name: 'racism' },
        resources: [{ resource: { id: 1, name: 'tt1', displayName: 'A Movie' }, averageScore: 5, flagCount: 1 }],
      },
    ]);

    expect(fixture.componentInstance.rankings()[0].resources.length).toBe(1);
  });

  describe('imdb/standard (category-only rating domain)', () => {
    // The outer beforeEach above already injects HttpTestingController,
    // which locks the module against further provider overrides — reset
    // and reconfigure from scratch with imdb/standard enabled instead of
    // overriding the already-instantiated module.
    beforeEach(async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [RankingsPanelComponent],
        providers: [
          provideRouter([]),
          provideHttpClient(withInterceptors([errorInterceptor])),
          provideHttpClientTesting(),
          { provide: DOMAIN_OPTIONS_TOKEN, useValue: BOTH_DOMAINS_ENABLED },
        ],
      }).compileComponents();
      httpMock = TestBed.inject(HttpTestingController);
      // Safe here (unlike resource-detail's tests): nothing in this spec
      // ever logs a user in, so select()'s domain-switch logout is a no-op.
      TestBed.inject(DomainSelectionService).select('imdb/standard');
    });

    it('renders a pick count instead of an average score', () => {
      const fixture = TestBed.createComponent(RankingsPanelComponent);

      httpMock.expectOne(`${API_BASE_URL}/rankings`).flush([
        {
          postType: { id: 1, name: 'i-loved-it' },
          resources: [{ resource: { id: 1, name: 'tt1', displayName: 'A Movie' }, averageScore: 0, flagCount: 12 }],
        },
      ]);
      fixture.detectChanges();

      expect(fixture.componentInstance.isCategoryOnly()).toBe(true);
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('12 picks');
      expect(text).not.toContain('avg');
    });

    it('does not run any ranking post-processing — postProcessRankings is unset for this domain', () => {
      const fixture = TestBed.createComponent(RankingsPanelComponent);

      httpMock.expectOne(`${API_BASE_URL}/rankings`).flush([
        {
          postType: { id: 1, name: 'skip-it' },
          resources: [{ resource: { id: 1, name: 'tt1', displayName: 'A Movie' }, averageScore: 0, flagCount: 3 }],
        },
      ]);

      // No GET .../posts request follows, unlike bigotry's severity
      // re-check — afterEach's httpMock.verify() would fail otherwise.
      expect(fixture.componentInstance.rankings().length).toBe(1);
    });
  });
});

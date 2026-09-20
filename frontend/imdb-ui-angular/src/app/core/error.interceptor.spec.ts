import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { errorInterceptor, AppHttpError } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('extracts the ProblemDetail "detail" message on a 404', () => {
    let captured: unknown;
    http.get('/resources/99').subscribe({ error: (err) => (captured = err) });

    httpMock.expectOne('/resources/99').flush(
      { detail: 'Resource 99 not found', status: 404, title: 'Not Found' },
      { status: 404, statusText: 'Not Found' },
    );

    expect(captured).toBeInstanceOf(AppHttpError);
    expect((captured as AppHttpError).message).toBe('Resource 99 not found');
    expect((captured as AppHttpError).status).toBe(404);
  });

  it('carries per-field errors from a validation failure', () => {
    let captured: unknown;
    http.post('/resources', {}).subscribe({ error: (err) => (captured = err) });

    httpMock.expectOne('/resources').flush(
      {
        detail: 'Validation failed for one or more fields',
        errors: { name: 'must not be blank' },
      },
      { status: 400, statusText: 'Bad Request' },
    );

    expect((captured as AppHttpError).fieldErrors).toEqual({ name: 'must not be blank' });
  });

  it('gives a network-failure message when status is 0', () => {
    let captured: unknown;
    http.get('/resources').subscribe({ error: (err) => (captured = err) });

    httpMock.expectOne('/resources').error(new ProgressEvent('error'), { status: 0 });

    expect((captured as AppHttpError).message).toContain('Could not reach the server');
  });
});

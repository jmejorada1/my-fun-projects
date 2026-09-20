import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { RegisterComponent } from './register.component';
import { API_BASE_URL } from '../../core/api-config';
import { errorInterceptor } from '../../core/error.interceptor';

describe('RegisterComponent', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => httpMock.verify());

  it('actually submits via the real DOM form', () => {
    // Same class of bug already fixed twice elsewhere: (ngSubmit) does
    // nothing without [formGroup] backing the <form>.
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();

    const usernameInput: HTMLInputElement = fixture.nativeElement.querySelector('#username');
    usernameInput.value = 'newuser';
    usernameInput.dispatchEvent(new Event('input'));
    const emailInput: HTMLInputElement = fixture.nativeElement.querySelector('#email');
    emailInput.value = 'new@example.com';
    emailInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    httpMock
      .expectOne(`${API_BASE_URL}/dev/users`)
      .flush({ id: 1, username: 'newuser', email: 'new@example.com', firstName: null, lastName: null });
  });

  it('does not submit an invalid form', () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.componentInstance.username.setValue('');
    fixture.componentInstance.email.setValue('not-an-email');

    fixture.componentInstance.submit();

    httpMock.expectNone(() => true);
    expect(fixture.componentInstance.username.touched).toBe(true);
    expect(fixture.componentInstance.email.touched).toBe(true);
  });

  it('registers, auto-logs in, and navigates to the dashboard on success', () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    fixture.componentInstance.username.setValue('newuser');
    fixture.componentInstance.email.setValue('new@example.com');

    fixture.componentInstance.submit();

    const req = httpMock.expectOne(`${API_BASE_URL}/dev/users`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'newuser', email: 'new@example.com' });
    req.flush({ id: 1, username: 'newuser', email: 'new@example.com', firstName: null, lastName: null });

    expect(navigateSpy).toHaveBeenCalledWith('/');
    expect(fixture.componentInstance.submitting()).toBe(false);
  });

  it('shows a conflict message when the username/email is already taken', () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.componentInstance.username.setValue('jdoe');
    fixture.componentInstance.email.setValue('jdoe@example.com');

    fixture.componentInstance.submit();

    httpMock
      .expectOne(`${API_BASE_URL}/dev/users`)
      .flush(
        { detail: 'The request conflicts with an existing resource or constraint' },
        { status: 409, statusText: 'Conflict' },
      );

    expect(fixture.componentInstance.errorMessage()).toBe(
      'The request conflicts with an existing resource or constraint',
    );
  });
});

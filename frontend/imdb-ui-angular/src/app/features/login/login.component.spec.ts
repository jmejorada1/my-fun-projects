import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { LoginComponent } from './login.component';
import { API_BASE_URL } from '../../core/api-config';
import { errorInterceptor } from '../../core/error.interceptor';

describe('LoginComponent', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
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

  it('actually submits via the real DOM form, not just by calling submit() directly', () => {
    // Regression test: (ngSubmit) previously did nothing at all, because
    // the <form> had no [formGroup]/NgForm directive backing it — calling
    // component.submit() directly (as the other tests below do) doesn't
    // exercise that wiring and would have passed even with the bug.
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('#username');
    input.value = 'jdoe';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    httpMock
      .expectOne(`${API_BASE_URL}/dev/users/by-username/jdoe`)
      .flush({ id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null });
  });

  it('does not submit a blank username', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.componentInstance.username.setValue('');

    fixture.componentInstance.submit();

    httpMock.expectNone(() => true);
    expect(fixture.componentInstance.username.touched).toBe(true);
  });

  it('logs in and navigates to the dashboard on success', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    fixture.componentInstance.username.setValue('jdoe');

    fixture.componentInstance.submit();

    httpMock
      .expectOne(`${API_BASE_URL}/dev/users/by-username/jdoe`)
      .flush({ id: 1, username: 'jdoe', email: 'jdoe@example.com', firstName: null, lastName: null });

    expect(navigateSpy).toHaveBeenCalledWith('/');
    expect(fixture.componentInstance.submitting()).toBe(false);
  });

  it('shows a not-found message when the username does not exist', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.componentInstance.username.setValue('ghost');

    fixture.componentInstance.submit();

    httpMock
      .expectOne(`${API_BASE_URL}/dev/users/by-username/ghost`)
      .flush({ detail: "AppUser with username 'ghost' not found" }, { status: 404, statusText: 'Not Found' });

    expect(fixture.componentInstance.errorMessage()).toBe("AppUser with username 'ghost' not found");
  });
});

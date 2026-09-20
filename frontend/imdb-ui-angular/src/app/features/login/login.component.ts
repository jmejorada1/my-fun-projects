import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { AppHttpError } from '../../core/error.interceptor';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /**
   * (ngSubmit) only works on a <form> backed by FormGroupDirective
   * ([formGroup]) or FormsModule's NgForm — a bare <form> with only
   * ReactiveFormsModule and no [formGroup] never fires it (Angular treats
   * "ngSubmit" as a nonexistent native DOM event instead). Wrapping the
   * single control in a FormGroup is what makes the template's
   * [formGroup]/(ngSubmit) binding actually work.
   */
  readonly form = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  readonly username = this.form.controls.username;
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  submit(): void {
    if (this.username.invalid || this.submitting()) {
      this.username.markAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.auth.login(this.username.value).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl('/');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(err instanceof AppHttpError ? err.message : 'Login failed.');
      },
    });
  }
}

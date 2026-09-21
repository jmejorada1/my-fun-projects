import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { AppHttpError } from '../../core/error.interceptor';
import { DomainSelectionService } from '../../core/domain-selection.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly domainSelection = inject(DomainSelectionService);

  /** The currently-selected domain option, so register shows its friendly
   * name instead of the raw backend domain value (e.g. "imdb/bigotry"). */
  readonly currentDomain = computed(() =>
    this.domainSelection.options.find((option) => option.value === this.domainSelection.selectedDomain()),
  );

  // [formGroup] on the <form> is required for (ngSubmit) to fire at all —
  // see the identical bug fixed in login.component.ts.
  readonly form = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(15)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(15)],
    }),
  });
  readonly username = this.form.controls.username;
  readonly email = this.form.controls.email;
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.auth.register(this.username.value, this.email.value).subscribe({
      next: () => {
        this.submitting.set(false);
        // Auto-login after registering — no separate "now go log in" step.
        this.router.navigateByUrl('/');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(err instanceof AppHttpError ? err.message : 'Registration failed.');
      },
    });
  }
}

import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../Core/Services/auth-service';
import { Router } from '@angular/router';
import { UserRegistration } from '../../../Core/Interfaces/user';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { ThemeService } from '../../../Core/Services/theme.service';
import { environment } from '../../../../environments/environment';
import { StateStore } from '../../../Store/state.store';

@Component({
  selector: 'app-auth',
  imports: [ReactiveFormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.scss',
})
export class Auth {
  authService = inject(AuthService);
  alertify = inject(AlertifyService);
  fb = inject(FormBuilder);
  router = inject(Router);
  themeService = inject(ThemeService);
  stateStore = inject(StateStore);
  validators = signal(false);
  loginMode = computed(() => this.authService.authModalMode() === 'login');

  loginForm = this.fb.group({
    email: ['', Validators.required],
    password: ['', Validators.required],
    rememberMe: [false]
  })
  registerForm = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', Validators.required],
    password: ['', Validators.required],
    confirmPassword: ['', Validators.required],
  })

  isLoggingIn = signal(false);

  logIn() {
    this.validators.set(true);
    if (this.loginForm.valid) {
      this.validators.set(false);
      this.isLoggingIn.set(true);
      this.authService.login(this.loginForm.get('email')?.value!, this.loginForm.get('password')?.value!).subscribe({
        next: async () => {
          try {
            await this.stateStore.loadProfile(true);
          } catch (err) {
            console.error('Error hydrating profile on login:', err);
          }

          const returnUrl = this.authService.returnUrl();
          const hasNullSubscription = !this.stateStore.hasActiveSubscription();
          const isOnboardingDone = this.stateStore.isOnboardingCompleted();

          let targetUrl = '/private/onboarding';
          if (returnUrl) {
            targetUrl = returnUrl;
            this.authService.returnUrl.set(null);
          } else if (isOnboardingDone && !hasNullSubscription) {
            targetUrl = this.stateStore.isPro() ? '/private/dashboard' : '/private/profile';
          }

          try {
            await this.router.navigateByUrl(targetUrl);
          } finally {
            this.authService.closeAuthModal();
            this.isLoggingIn.set(false);
          }
        },
        error: (err) => {
          this.isLoggingIn.set(false);
          this.alertify.error(err);
        }
      });
    }
  }


  register() {
    this.validators.set(true);
    if (this.registerForm.valid && this.registerForm.get('password')?.value === this.registerForm.get('confirmPassword')?.value) {
      console.log(this.registerForm.value);
      this.authService.userRegistration(this.registerForm.value as UserRegistration).subscribe({
        next: () => {
          this.alertify.success("რეგისტრაცია წარმატებით დასრულდა");
          this.validators.set(false);
          this.registerForm.reset();
          this.loginForm.reset();
        },
        error: (err) => {
          this.authService.authModalMode.set('register');
          this.alertify.error(err);
        },
        complete: () => { this.authService.authModalMode.set('login') }
      });

    }
  }
  isInvalid(name: string) {
    const control = this.loginMode() ? this.loginForm.get(name) : this.registerForm.get(name);
    return !!(control && control.invalid && (control.touched || this.validators()));
  }


  modeChanger() {
    const current = this.authService.authModalMode();
    this.authService.authModalMode.set(current === 'login' ? 'register' : 'login');
  }

  signInWithGoogle(): void {
    window.location.href = `${environment.apiUrl}/auth/google/login`;
  }

  @HostListener('document:keydown.escape')
  handleEscapeKey() {
    this.authService.closeAuthModal();
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../Core/Services/auth-service';
import { Router } from '@angular/router';
import { UserRegistration } from '../../../Core/Interfaces/user';
import { AlertifyService } from '../../../Core/Services/alertify.service';

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
  validators = signal(false);
  loginMode = signal(true);

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

  logIn() {
    this.validators.set(true);
    if (this.loginForm.valid) {
      this.validators.set(false);
      this.authService.login(this.loginForm.get('email')?.value!, this.loginForm.get('password')?.value!).then(() => {
        this.router.navigate(['/private'])
        this.alertify.success("ავტორიზაცია წარმატებით დასრულდა")});

    }

  }
  register() {
    this.validators.set(true);
    if (this.registerForm.valid && this.registerForm.get('password')?.value === this.registerForm.get('confirmPassword')?.value) {
      console.log(this.registerForm.value);
      this.authService.userRegistration(this.registerForm.value as UserRegistration).then(() => {
        this.loginMode.set(true)});
        this.registerForm.reset();
        this.alertify.success("რეგისტრაცია წარმატებით დასრულდა");
    }
  }
  isInvalid(name: string) {
    const control = this.loginMode() ? this.loginForm.get(name) : this.registerForm.get(name);
    return !!(control && control.invalid && (control.touched || this.validators()));
  }


  modeChanger() {
    this.loginMode.set(!this.loginMode());
  }
}

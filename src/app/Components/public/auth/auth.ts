import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../Core/Services/auth-service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-auth',
  imports: [ReactiveFormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.scss',
})
export class Auth {
  authService = inject(AuthService)
  fb = inject(FormBuilder);
  router = inject(Router);
  validators = signal(false);
  form = this.fb.group({
        email:['', Validators.required],
        password:['', Validators.required],
        rememberMe:[false]
  })

  logIn(){
    this.validators.set(true);
    if(this.form.valid){
      this.validators.set(false);
      this.authService.login(this.form.get('email')?.value!, this.form.get('password')?.value!).then(() => this.router.navigate(['/private']));
    }
    
  }

  isInvalid(name: string) {
  const control = this.form.get(name);
  return !!(control && control.invalid && (control.touched || this.validators()));
}
}

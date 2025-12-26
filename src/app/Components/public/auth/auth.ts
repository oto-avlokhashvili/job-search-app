import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-auth',
  imports: [ReactiveFormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.scss',
})
export class Auth {
  fb = inject(FormBuilder);
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
      console.log(this.form.value);
    }
    
  }

  isInvalid(name: string) {
  const control = this.form.get(name);
  return !!(control && control.invalid && (control.touched || this.validators()));
}
}

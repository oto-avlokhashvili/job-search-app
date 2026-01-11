import { Component, inject } from '@angular/core';
import { AuthService } from '../../../Core/Services/auth-service';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomeComponent {
  authService = inject(AuthService)

  getProfile(){
    this.authService.getUserProfile()
  }
  constructor(){
    this.getProfile()
  }
}

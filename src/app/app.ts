import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadingIndicatorComponent } from "./Core/loading/loading.component";
import { AuthService } from './Core/Services/auth-service';
import { Footer } from './Components/public/footer/footer';
import { Home } from './Components/public/home/home';
import { Header } from './Components/public/header/header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingIndicatorComponent, Footer, Header],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('job-search-app');
  isAuthorized = signal(false);
  authService = inject(AuthService)
  constructor(){
    this.isAuthorized.set(this.authService.isLoggedIn())
    console.log(this.authService.isLoggedIn());
    
  }
}

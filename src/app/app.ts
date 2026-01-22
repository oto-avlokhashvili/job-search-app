import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LoadingIndicatorComponent } from "./Core/loading/loading.component";
import { AuthService } from './Core/Services/auth-service';
import { Footer } from './Components/public/footer/footer';
import { Home } from './Components/public/home/home';
import { Header } from './Components/public/header/header';
import { filter } from 'rxjs';

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
  hideLayout = signal(false);
  showHeroSection = signal(false);
  constructor(private router: Router, private route: ActivatedRoute){
    this.isAuthorized.set(this.authService.isLoggedIn())
    

    this.router.events
    .pipe(filter(e => e instanceof NavigationEnd))
    .subscribe(() => {
      let r = this.route.firstChild;
      while (r?.firstChild) r = r.firstChild;
      this.hideLayout.set(r?.snapshot.data['hideLayout'] ?? false);
      this.showHeroSection.set(r?.snapshot.data['showHeroSection'] ?? false);
    });
  }

}

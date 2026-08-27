import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { LoadingIndicatorComponent } from "./Core/loading/loading.component";
import { AuthService } from './Core/Services/auth-service';
import { Footer } from './Components/public/footer/footer';
import { Home } from './Components/public/home/home';
import { Header } from './Components/public/header/header';
import { filter } from 'rxjs';
import { ThemeService } from './Core/Services/theme.service';
import { Auth } from './Components/public/auth/auth';
import { StateStore } from './Store/state.store';
import { ChatWidget } from './Components/private/chat-widget/chat-widget';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingIndicatorComponent, Footer, Header, RouterModule, Auth, ChatWidget],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('job-search-app');
  isAuthorized = signal(false);
  authService = inject(AuthService);
  stateStore = inject(StateStore);
  themeService = inject(ThemeService);
  hideLayout = signal(false);
  hideFooter = signal(typeof window !== 'undefined' && window.location.pathname.startsWith('/private'));
  showHeroSection = signal(false);
  constructor(private router: Router, private route: ActivatedRoute){
    this.themeService.init();
    this.isAuthorized.set(this.authService.isLoggedIn());
    if (this.authService.isLoggedIn()) {
      this.stateStore.ensureDataLoaded();
    }
    

    this.router.events
    .pipe(filter(e => e instanceof NavigationEnd))
    .subscribe((e: NavigationEnd) => {
      let r = this.route.firstChild;
      while (r?.firstChild) r = r.firstChild;
      const isPrivate = e.urlAfterRedirects.startsWith('/private') || (typeof window !== 'undefined' && window.location.pathname.startsWith('/private'));
      this.hideLayout.set(r?.snapshot.data['hideLayout'] ?? false);
      this.hideFooter.set(isPrivate || (r?.snapshot.data['hideFooter'] ?? false));
      this.showHeroSection.set(r?.snapshot.data['showHeroSection'] ?? false);
    });
  }
  scroll(target: string) {
    document.querySelector(`#${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

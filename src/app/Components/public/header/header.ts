import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';
import { ThemeService } from '../../../Core/Services/theme.service';

@Component({
  selector: 'app-header',
  imports: [RouterModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  menuOpen = false;
  authService = inject(AuthService);
  themeService = inject(ThemeService);
  scroll(target: string) {
    document.querySelector(`#${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

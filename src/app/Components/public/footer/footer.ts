import { Component, inject } from '@angular/core';
import { ThemeService } from '../../../Core/Services/theme.service';
import { AuthService } from '../../../Core/Services/auth-service';

@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  themeService = inject(ThemeService);
  authService = inject(AuthService);
}

import { Component, inject } from '@angular/core';
import { ThemeService } from '../../../Core/Services/theme.service';
import { AuthService } from '../../../Core/Services/auth-service';

import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-footer',
  imports: [RouterModule],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  themeService = inject(ThemeService);
  authService = inject(AuthService);
}

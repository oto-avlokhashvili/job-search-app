import { Component, inject } from '@angular/core';
import { ThemeService } from '../../../Core/Services/theme.service';
import { AuthService } from '../../../Core/Services/auth-service';

import { RouterModule } from '@angular/router';
import { LANDING_PAGES } from '../../../Core/Utils/landing-pages';

// Site-wide links into the SEO landing pages (internal linking for crawlers).
const FOOTER_CATEGORIES = ['it', 'developer', 'sales', 'accountant', 'finance', 'marketing', 'manager', 'driver', 'operator'];

@Component({
  selector: 'app-footer',
  imports: [RouterModule],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  themeService = inject(ThemeService);
  authService = inject(AuthService);

  cityLinks = LANDING_PAGES.filter((p) => p.kind === 'city');
  categoryLinks = LANDING_PAGES.filter((p) => FOOTER_CATEGORIES.includes(p.slug));
  typeLinks = LANDING_PAGES.filter((p) => p.kind === 'type');
}

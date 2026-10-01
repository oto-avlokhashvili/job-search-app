import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../Core/Services/auth-service';

@Component({
  selector: 'app-ai-agent-banner',
  standalone: true,
  templateUrl: './ai-agent-banner.html',
  styleUrl: './ai-agent-banner.scss',
})
export class AiAgentBanner {
  private authService = inject(AuthService);
  private router = inject(Router);

  // Only has an effect on mobile, where the banner collapses into an accordion.
  expanded = signal(false);

  toggle() {
    this.expanded.update(v => !v);
  }

  handleAiAgentClick() {
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/private/profile']);
    } else {
      this.authService.openAuthModal('login', '/private/profile');
    }
  }
}

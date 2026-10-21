import { Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-ai-agent-banner',
  standalone: true,
  templateUrl: './ai-agent-banner.html',
  styleUrl: './ai-agent-banner.scss',
})
export class AiAgentBanner {
  private dialog = inject(MatDialog);

  // Only has an effect on mobile, where the banner collapses into an accordion.
  expanded = signal(false);

  toggle() {
    this.expanded.update(v => !v);
  }

  /** Sign in, CV and Telegram in one modal; it skips whatever the user has already done. */
  async handleAiAgentClick() {
    // Loaded on demand: the banner is on public pages and most visitors never click it.
    const { openNotificationChannelsModal } = await import('../notification-channels-modal/notification-channels-modal');
    openNotificationChannelsModal(this.dialog);
  }
}

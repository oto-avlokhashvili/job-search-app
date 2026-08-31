import {
  Component,
  computed,
  inject,
  ViewChild,
  ElementRef,
  signal,
  OnInit,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Ai } from '../../../Core/Services/ai';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../Core/Services/auth-service';
import { StateStore } from '../../../Store/state.store';
import { MatDialog } from '@angular/material/dialog';
import { SubscriptionModal } from '../private-layout/subscription-modal/subscription-modal';
import { Onboarding } from '../onboarding/onboarding';

export interface WidgetChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isError?: boolean;
  jobs?: any[];
}

export interface ChatQuota {
  used: number;
  limit: number;
  remaining: number;
}

@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-widget.html',
  styleUrl: './chat-widget.scss',
})
export class ChatWidget implements OnInit, AfterViewChecked {
  @ViewChild('messagesScroll') private messagesScroll!: ElementRef<HTMLDivElement>;

  aiService = inject(Ai);
  authService = inject(AuthService);
  stateStore = inject(StateStore);
  dialog = inject(MatDialog);

  isLoggedIn = computed(() => this.authService.isLoggedIn());
  isChatOpen = signal<boolean>(false);
  chatInputText = signal<string>('');
  chatMessages = signal<WidgetChatMessage[]>([]);
  isTyping = signal<boolean>(false);
  chatQuota = signal<ChatQuota | null>(null);
  private shouldScrollToBottom = false;

  openAuthModal() {
    this.authService.openAuthModal('login');
  }

  openOnboarding(step: number = 1) {
    const dialogRef = this.dialog.open(Onboarding, {
      width: '1100px',
      maxWidth: '96vw',
      maxHeight: '94vh',
      panelClass: 'onboarding-dialog',
      disableClose: false,
      autoFocus: false,
    });

    if (dialogRef.componentInstance) {
      dialogRef.componentInstance.goToStep(step);
    }

    dialogRef.afterClosed().subscribe(() => {
      this.stateStore.loadProfile(true);
      this.stateStore.getCv(true);
      this.loadQuota();
    });
  }

  openUpgradeModal() {
    this.dialog.open(SubscriptionModal, {
      width: '560px',
      maxWidth: '95vw',
      panelClass: 'subscription-dialog',
      disableClose: false,
      autoFocus: false,
    });
  }


  async ngOnInit() {
    this.loadMessages();
    if (this.isLoggedIn()) {
      await this.loadQuota();
    }
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  async toggleChat() {
    const nextState = !this.isChatOpen();
    this.isChatOpen.set(nextState);
    if (nextState) {
      this.shouldScrollToBottom = true;
      if (this.isLoggedIn()) {
        await this.loadQuota();
      }
    }
  }

  async loadQuota() {
    if (!this.isLoggedIn() || this.stateStore.isPro()) return;
    try {
      const res = await firstValueFrom(this.aiService.getChatQuota());
      if (res) {
        this.chatQuota.set({
          used: res.used,
          limit: res.limit,
          remaining: res.remaining,
        });
      }
    } catch (err) {
      console.warn('Failed to load chat quota:', err);
    }
  }

  async sendChatMessage() {
    const prompt = this.chatInputText().trim();
    if (!prompt || this.isTyping()) return;

    // If non-PRO user has exhausted daily limit (0 remaining)
    if (!this.stateStore.isPro() && this.chatQuota() && this.chatQuota()!.remaining <= 0) {
      return;
    }

    // Clear input
    this.chatInputText.set('');

    const userMsgId = Math.random().toString(36).substring(7);
    const userMessage: WidgetChatMessage = {
      id: userMsgId,
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };

    // Add user message
    this.chatMessages.update((msgs) => [...msgs, userMessage]);
    this.saveMessages();
    this.shouldScrollToBottom = true;

    // Set typing state
    this.isTyping.set(true);

    try {
      // Map existing messages to history format required by backend service
      const history = this.chatMessages()
        .filter((msg) => msg.id !== userMsgId && !msg.isError)
        .map((msg) => ({
          role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model',
          text: msg.content,
        }))
        .slice(-6); // Limit to last 6 messages for context length optimization

      const res = await firstValueFrom(this.aiService.askChat(prompt, history));

      // Update quota if returned in response
      if (res?.quota) {
        this.chatQuota.set(res.quota);
      }

      const isSearchEmpty = res?.searchTriggered && (!res?.jobs || res?.jobs.length === 0);

      const botMessage: WidgetChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: res?.response || res?.text || 'შეცდომა პასუხის მიღებისას.',
        timestamp: new Date(),
        jobs: res?.jobs || [],
        isError: isSearchEmpty || res?.isError || false,
      };

      this.chatMessages.update((msgs) => [...msgs, botMessage]);
    } catch (err: any) {
      console.error('Widget chat error:', err);
      const serverMessage = err?.error?.message || err?.message;

      if (err?.status === 429) {
        this.chatQuota.update((q) => (q ? { ...q, remaining: 0 } : { used: 3, limit: 3, remaining: 0 }));
      }

      const errorMessage: WidgetChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: serverMessage || 'სამწუხაროდ, პასუხის მიღება ვერ მოხერხდა. გთხოვთ სცადოთ მოგვიანებით.',
        timestamp: new Date(),
        isError: true,
      };
      this.chatMessages.update((msgs) => [...msgs, errorMessage]);
    } finally {
      this.isTyping.set(false);
      this.saveMessages();
      this.shouldScrollToBottom = true;
    }
  }

  clearChat() {
    this.chatMessages.set([]);
    this.saveMessages();
  }

  formatTime(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleTimeString('ka-GE', { hour: '2-digit', minute: '2-digit' });
  }

  private scrollToBottom(): void {
    try {
      const el = this.messagesScroll.nativeElement;
      el.scrollTop = el.scrollHeight;
    } catch (err) {
      // Ignore
    }
  }

  private loadMessages() {
    try {
      const raw = sessionStorage.getItem('chat_widget_messages');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.chatMessages.set(
            parsed.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }))
          );
        }
      }
    } catch (err) {
      console.error('Error loading chat widget messages from sessionStorage', err);
    }
  }

  private saveMessages() {
    try {
      sessionStorage.setItem('chat_widget_messages', JSON.stringify(this.chatMessages()));
    } catch (err) {
      console.error('Error saving chat widget messages to sessionStorage', err);
    }
  }
}

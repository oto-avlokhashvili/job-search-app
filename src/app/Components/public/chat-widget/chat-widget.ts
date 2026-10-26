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
import { Router } from '@angular/router';
import { SubscriptionModal } from '../subscription-modal/subscription-modal';

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

export interface PromoMessage {
  id: 'cv' | 'ai';
  /** Wait after the previous promo (or after page entry for the first one). */
  delayMs: number;
  preview: string;
}

const PROMO_MESSAGES: PromoMessage[] = [
  { id: 'cv', delayMs: 5_000, preview: '👋 ატვირთე CV და რეკრუტერი თავად გიპოვის' },
  { id: 'ai', delayMs: 20_000, preview: '🤖 მიიღე ვაკანსიები შეტყობინებით ყოველ დღე' },
];

const PREVIEW_MS = 3000;
/** Gap between one preview closing and the next popping up, so the leave animation can finish. */
const NEXT_PREVIEW_GAP_MS = 1000;
const PROMO_STATE_KEY = 'chat_widget_promos';

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
  private router = inject(Router);

  isLoggedIn = computed(() => this.authService.isLoggedIn());
  isChatOpen = signal<boolean>(false);
  chatInputText = signal<string>('');
  chatMessages = signal<WidgetChatMessage[]>([]);
  isTyping = signal<boolean>(false);
  chatQuota = signal<ChatQuota | null>(null);
  private shouldScrollToBottom = false;

  /**
   * Promo messages for logged-out visitors arrive in the chat over time. Each arrival
   * briefly previews above the button and adds to the unread badge.
   */
  arrivedPromos = signal(0);
  unreadPromos = signal(0);
  previewPromo = signal<PromoMessage | null>(null);

  openAuthModal() {
    this.authService.openAuthModal('login');
  }

  openProfile() {
    this.isChatOpen.set(false);
    this.router.navigate(['/profile']);
  }

  openUpgradeModal() {
    this.dialog.open(SubscriptionModal, {
      width: '960px',
      maxWidth: '96vw',
      panelClass: 'subscription-dialog',
      disableClose: false,
      autoFocus: false,
    });
  }


  async ngOnInit() {
    this.loadMessages();
    if (!this.isLoggedIn()) {
      this.schedulePromos();
    }
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

  /**
   * Restores promos already delivered this session, then schedules the rest relative
   * to when the visit started, so a reload doesn't replay or restart them.
   */
  private schedulePromos() {
    const saved = this.loadPromoState();
    const startedAt = saved?.startedAt ?? Date.now();
    this.promoStartedAt = startedAt;
    this.arrivedPromos.set(saved?.arrived ?? 0);
    this.unreadPromos.set(saved?.unread ?? 0);
    this.savePromoState();

    const elapsed = Date.now() - startedAt;
    let dueAt = 0;
    PROMO_MESSAGES.forEach((promo, i) => {
      dueAt += promo.delayMs;
      if (i + 1 > this.arrivedPromos()) {
        setTimeout(() => this.deliverPromo(i + 1), Math.max(dueAt - elapsed, 0));
      }
    });
  }

  private deliverPromo(count: number) {
    if (this.isLoggedIn() || count <= this.arrivedPromos()) return;
    this.arrivedPromos.set(count);
    if (this.isChatOpen()) {
      this.shouldScrollToBottom = true;
    } else {
      this.unreadPromos.update((n) => n + 1);
      this.previewPromo.set(PROMO_MESSAGES[count - 1]);
      clearTimeout(this.previewTimer);
      this.previewTimer = setTimeout(() => this.closePreview(), PREVIEW_MS);
    }
    this.savePromoState();
  }

  private promoStartedAt = 0;

  private loadPromoState(): { startedAt: number; arrived: number; unread: number } | null {
    try {
      const saved = JSON.parse(sessionStorage.getItem(PROMO_STATE_KEY) || 'null');
      return saved && typeof saved.startedAt === 'number' ? saved : null;
    } catch {
      return null;
    }
  }

  private savePromoState() {
    if (!this.promoStartedAt) return;
    try {
      sessionStorage.setItem(
        PROMO_STATE_KEY,
        JSON.stringify({ startedAt: this.promoStartedAt, arrived: this.arrivedPromos(), unread: this.unreadPromos() }),
      );
    } catch {}
  }

  private previewTimer?: ReturnType<typeof setTimeout>;

  /**
   * Hides the preview only; the message stays unread in the chat. Once a preview closes
   * (by its X or on its own), the next promo pops up right away instead of on its schedule.
   */
  closePreview() {
    clearTimeout(this.previewTimer);
    const closed = this.previewPromo();
    this.previewPromo.set(null);
    if (!closed) return;
    const next = PROMO_MESSAGES.indexOf(closed) + 2;
    if (next <= PROMO_MESSAGES.length) {
      setTimeout(() => this.deliverPromo(next), NEXT_PREVIEW_GAP_MS);
    }
  }

  async openCvUpload() {
    this.isChatOpen.set(false);
    this.previewPromo.set(null);
    // Loaded on demand: the widget is on every public page.
    const { PublicCvModal } = await import('../public-cv-modal/public-cv-modal');
    this.dialog.open(PublicCvModal, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'public-cv-dialog',
      autoFocus: false,
    });
  }

  async openAiAgent() {
    this.isChatOpen.set(false);
    this.previewPromo.set(null);
    // Sign in, CV and Telegram in one modal. Loaded on demand: the widget is on every public page.
    const { openNotificationChannelsModal } = await import('../notification-channels-modal/notification-channels-modal');
    openNotificationChannelsModal(this.dialog);
  }

  async toggleChat() {
    this.unreadPromos.set(0);
    this.savePromoState();
    this.previewPromo.set(null);
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

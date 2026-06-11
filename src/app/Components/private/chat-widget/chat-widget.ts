import {
  Component,
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

export interface WidgetChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isError?: boolean;
  jobs?: any[];
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

  isChatOpen = signal<boolean>(false);
  chatInputText = signal<string>('');
  chatMessages = signal<WidgetChatMessage[]>([]);
  isTyping = signal<boolean>(false);
  private shouldScrollToBottom = false;

  ngOnInit() {
    this.loadMessages();
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  toggleChat() {
    this.isChatOpen.set(!this.isChatOpen());
    if (this.isChatOpen()) {
      this.shouldScrollToBottom = true;
    }
  }

  async sendChatMessage() {
    const prompt = this.chatInputText().trim();
    if (!prompt || this.isTyping()) return;

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
      // History should exclude the message we are currently sending
      const history = this.chatMessages()
        .filter((msg) => msg.id !== userMsgId && !msg.isError)
        .map((msg) => ({
          role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model',
          text: msg.content,
        }))
        .slice(-6); // Limit to last 6 messages for context length optimization

      const res = await firstValueFrom(this.aiService.askChat(prompt, history));

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
    } catch (err) {
      console.error('Widget chat error:', err);
      const errorMessage: WidgetChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: 'უკავშირდები სერვერს... გთხოვთ სცადოთ მოგვიანებით.',
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

import {
  Component,
  inject,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  computed,
  OnInit,
  signal,
  OnDestroy,
  effect,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateStore } from '../../../Store/state.store';
import { ChatStore, Conversation } from '../../../Store/chat.store';
import { ActivatedRoute, Router } from '@angular/router';
import { Ai } from '../../../Core/Services/ai';
import { Subscription } from 'rxjs';

export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  file: File;
}

export interface JobMatch {
  id: number;
  vacancy: string;
  location: string;
  company: string;
  link: string;
  publishDate: string;
  deadline: string;
  salaryRange?: string;
  match: number;
  queryMatch: boolean;
  matchReason: string;
  matchGaps?: string[];
}

export interface AiStructuredResponse {
  candidateProfile?: any;
  summary?: string;
  strengths?: string[];
  skillGaps?: string[];
  topJobs?: JobMatch[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  data?: AiStructuredResponse;
  timestamp: Date;
  attachments?: AttachedFile[];
  isLoading?: boolean;
  isError?: boolean;
}

@Component({
  selector: 'app-chat',
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class Chat implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('messageInput') private messageInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('fileInput') private fileInput!: ElementRef<HTMLInputElement>;

  stateStore = inject(StateStore);
  chatStore = inject(ChatStore);
  route = inject(ActivatedRoute);
  router = inject(Router);
  aiService = inject(Ai);

  inputText = signal<string>('');
  attachedFiles = signal<AttachedFile[]>([]);
  isTyping = signal<boolean>(false);
  isDragOver = signal<boolean>(false);
  chatMode = signal<'prompt' | 'job-search'>('job-search');
  shouldScrollToBottom = false;

  private routeSub?: Subscription;

  constructor() {
    // Reactively watch userCv from the store — no extra API call needed,
    // the metadata is already fetched by the layout.
    effect(() => {
      const cv = this.stateStore.userCv();
      if (!cv) {
        // CV removed — drop the auto-attached entry
        untracked(() => {
          this.attachedFiles.update(files => files.filter(f => f.id !== '__cv__'));
        });
        return;
      }

      // If we already have a REAL file with __cv__ id (manually uploaded in this session), 
      // don't overwrite it with a placeholder.
      const hasRealFile = untracked(() => {
        const current = this.attachedFiles().find(f => f.id === '__cv__');
        return current && current.file.size > 0;
      });

      if (hasRealFile) return;

      const fileName = cv.originalName ?? 'CV.pdf';
      const mimeType = cv.mimeType ?? 'application/pdf';
      // Use a zero-byte placeholder File — the real content lives on the server
      const placeholder = new File([], fileName, { type: mimeType });
      const cvAttachment: AttachedFile = {
        id: '__cv__',
        name: fileName,
        size: cv.size ?? 0,
        type: mimeType,
        url: '',
        file: placeholder,
      };

      untracked(() => {
        this.attachedFiles.update(files => [
          cvAttachment,
          ...files.filter(f => f.id !== '__cv__'),
        ]);
      });
    });
  }

  // Active conversation id from route param
  activeId = signal<string | null>(null);

  // Messages of current conversation
  messages = computed<ChatMessage[]>(() => {
    const id = this.activeId();
    if (!id) return [];
    return this.chatStore.getConversation(id)?.messages ?? [];
  });

  userInitials = computed(() => {
    const p = this.stateStore.profile();
    if (!p) return 'U';
    return `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase();
  });

  maxFileSizeMB = 10;
  allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  ngOnInit() {
    this.routeSub = this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        // If conversation exists, activate it; otherwise create it
        const exists = this.chatStore.getConversation(id);
        if (exists) {
          this.chatStore.setActiveConversation(id);
          this.activeId.set(id);
        } else {
          // id not found — redirect to /private/chat to create fresh
          this.router.navigate(['/private/chat']);
        }
      } else {
        // No id param — check if there's an active conversation
        const activeId = this.chatStore.activeConversationId();
        if (activeId && this.chatStore.getConversation(activeId)) {
          this.router.navigate(['/private/chat', activeId]);
        } else if (this.chatStore.conversations().length > 0) {
          const first = this.chatStore.conversations()[0];
          this.router.navigate(['/private/chat', first.id]);
        } else {
          // Create the first conversation
          const newId = this.chatStore.createConversation();
          this.router.navigate(['/private/chat', newId]);
        }
      }
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  onTextInput(event: Event) {
    const ta = event.target as HTMLTextAreaElement;
    this.inputText.set(ta.value);
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  setMode(mode: 'prompt' | 'job-search') {
    this.chatMode.set(mode);
    if (mode === 'job-search') {
      this.inputText.set('');
      if (this.messageInput?.nativeElement) {
        this.messageInput.nativeElement.style.height = 'auto';
        this.messageInput.nativeElement.value = '';
      }
    }
  }

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.processFiles(Array.from(input.files));
      input.value = '';
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave() {
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files) this.processFiles(Array.from(files));
  }

  processFiles(files: File[]) {
    if (!files.length) return;
    const file = files[0];
    if (!this.allowedTypes.includes(file.type)) return;
    if (file.size > this.maxFileSizeMB * 1024 * 1024) return;

    // Add to attached files immediately so it can be sent
    const id = '__cv__';
    const newFile: AttachedFile = {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file),
      file: file
    };
    this.attachedFiles.update(current => [
      newFile,
      ...current.filter(f => f.id !== id)
    ]);

    // Upload CV to profile via StateStore
    this.stateStore.uploadCv(file);
  }

  removeAttachment(id: string) {
    this.attachedFiles.update(files => files.filter(f => f.id !== id));
  }

  getFileIcon(type: string): string {
    if (type === 'application/pdf') return '📄';
    if (type.includes('word')) return '📝';
    if (type === 'text/plain') return '📃';
    if (type.startsWith('image/')) return '🖼️';
    return '📎';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

async sendMessage() {
  const id = this.activeId();
  if (!id) return;

  const isJobSearch = this.chatMode() === 'job-search';
  const userText = this.inputText().trim();
  const files = this.attachedFiles();

  if (!isJobSearch && !userText && files.length === 0) return;
  if (this.isTyping()) return;

  const displayContent = isJobSearch ? '🔍 Find matching jobs' : userText;

  const userMsg: ChatMessage = {
    id: this.generateId(),
    role: 'user',
    content: displayContent,
    timestamp: new Date(),
    attachments: files.length > 0 ? [...files] : undefined,
  };

  this.chatStore.addMessage(id, userMsg);
  this.inputText.set('');
  if (this.messageInput?.nativeElement) {
    this.messageInput.nativeElement.style.height = 'auto';
    this.messageInput.nativeElement.value = '';
  }

  this.shouldScrollToBottom = true;
  this.isTyping.set(true);

  const loadingMsgId = this.generateId();
  this.chatStore.addMessage(id, {
    id: loadingMsgId,
    role: 'assistant',
    content: '',
    timestamp: new Date(),
    isLoading: true,
  });

  try {
    if (isJobSearch) {
      await this.runJobSearch(id, loadingMsgId);
    } else {
      await this.runPromptChat(id, loadingMsgId, userMsg, userText);
    }
  } catch {
    this.chatStore.removeMessage(id, loadingMsgId);
    this.chatStore.addMessage(id, {
      id: this.generateId(),
      role: 'assistant',
      content: 'მოხდა შეცდომა. გთხოვთ სცადოთ თავიდან.',
      timestamp: new Date(),
      isError: true,
    });
  } finally {
    this.isTyping.set(false);
    this.shouldScrollToBottom = true;
  }
}
  private async runJobSearch(id: string, loadingMsgId: string): Promise<void> {
  const res: any = await new Promise((resolve, reject) => {
    this.aiService.searchJobsWithAi().subscribe({ next: resolve, error: reject, complete: () => {this.stateStore.loadAIMatchedJobs(1, 5); } });
  });

  this.chatStore.removeMessage(id, loadingMsgId);

  const response = res?.response;
  this.chatStore.addMessage(id, {
    id: this.generateId(),
    role: 'assistant',
    content: res?.comment || response?.summary || '',
    data: typeof response === 'object' && response !== null ? response : undefined,
    timestamp: new Date(),
  });
}
  private async askChat(
    text: string,
    history: { role: 'user' | 'model'; text: string }[] = [],
  ): Promise<{ content: string; data?: AiStructuredResponse }> {
    const res: any = await new Promise((resolve, reject) => {
      this.aiService.askChat(text, history).subscribe({
        next: resolve,
        error: reject,
      });
    });

    const response = res?.response;

    if (typeof response === 'string') {
      return { content: response };
    }

    if (typeof response === 'object' && response !== null) {
      return {
        content: res?.comment || response.summary || '',
        data: response,
      };
    }

    return { content: '' };
  }
  private async runPromptChat(
  id: string,
  loadingMsgId: string,
  userMsg: ChatMessage,
  userText: string,
): Promise<void> {
  const history = this.messages()
    .filter((m) => !m.isLoading && !m.isError && m.id !== loadingMsgId && m.id !== userMsg.id)
    .slice(-6)
    .map((m) => {
      let text = m.content;
      if (m.role === 'assistant') {
        try {
          const parsed = JSON.parse(m.content);
          if (parsed?.response) text = parsed.response;
        } catch {
          // already plain text
        }
      }
      return {
        role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
        text,
      };
    });

  const resObj = await this.askChat(userText, history);
  this.chatStore.removeMessage(id, loadingMsgId);
  this.chatStore.addMessage(id, {
    id: this.generateId(),
    role: 'assistant',
    content: resObj.content,
    data: resObj.data,
    timestamp: new Date(),
  });
}
  private scrollToBottom() {
    try {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch { }
  }

  private generateId(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  trackById(_: number, item: { id: string }) {
    return item.id;
  }

  formatTime(date: Date): string {
    return new Intl.DateTimeFormat('ka-GE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  }

  formatMessageContent(content: string): string {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }
}

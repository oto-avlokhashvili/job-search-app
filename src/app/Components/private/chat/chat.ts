import {
  Component,
  inject,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  computed,
  OnInit,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { StateStore } from '../../../Store/state.store';
import { environment } from '../../../../environments/environment';
import { ActivatedRoute } from '@angular/router';
import { Ai } from '../../../Core/Services/ai';

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
export class Chat implements OnInit, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('messageInput') private messageInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('fileInput') private fileInput!: ElementRef<HTMLInputElement>;

  http = inject(HttpClient);
  stateStore = inject(StateStore);
  route = inject(ActivatedRoute);
  aiService = inject(Ai);
  messages = signal<ChatMessage[]>([]);
  inputText = signal<string>('');
  attachedFiles = signal<AttachedFile[]>([]);
  isTyping = signal<boolean>(false);
  isDragOver = signal<boolean>(false);
  shouldScrollToBottom = false;

  userInitials = computed(() => {
    const p = this.stateStore.profile();
    if (!p) return 'U';
    return `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase();
  });

  maxFileSizeMB = 10;
  allowedTypes = [
    'application/pdf', // PDF
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  ];

  constructor() {
    // Single effect to handle clear/reset from query params
    effect(() => {
      this.route.queryParams.subscribe(params => {
        if (params['reset'] || params['clear']) {
          this.messages.set([]);
          this.attachedFiles.set([]);
          this.inputText.set('');
        }
      });
    });
  }

  ngOnInit() {
    this.messages.set([
      {
        id: this.generateId(),
        role: 'assistant',
        content: `გამარჯობა 👋
გთხოვთ მომწეროთ რა ვაკანსიები გაინტერესებთ 💼 და ატვირთოთ რეზიუმე(CV) 📄

მე შემიძლია დაგეხმაროთ:

🔍 თქვენთვის შესაბამისი ვაკანსიების მოძებნაში
📄 რეზიუმე(CV)-ის ანალიზსა და გაუმჯობესებაში
🎯 თქვენი უნარების შესაბამისი პოზიციების შერჩევაში
💡 კარიერული რეკომენდაციების მოცემაში`,
        timestamp: new Date(),
      }
    ]);
    // Load history from localStorage for single persistent chat if desired, 
    // or just start fresh. Let's start fresh for now as per "one conversation" request.
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

  const file = files[0]; // only take first file

  // validate
  if (!this.allowedTypes.includes(file.type)) return;
  if (file.size > this.maxFileSizeMB * 1024 * 1024) return;

  const newFile: AttachedFile = {
    id: this.generateId(),
    name: file.name,
    size: file.size,
    type: file.type,
    url: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
    file,
  };

  // 🔥 replace instead of append
  this.attachedFiles.set([newFile]);
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
    const text = this.inputText().trim();
    const files = this.attachedFiles();

    if (!text && files.length === 0) return;
    if (this.isTyping()) return;

    const userMsg: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: text,
      timestamp: new Date(),
      attachments: files.length > 0 ? [...files] : undefined,
    };

    this.messages.update(m => [...m, userMsg]);
    this.inputText.set('');
    this.attachedFiles.set([]);
    if (this.messageInput?.nativeElement) {
      this.messageInput.nativeElement.style.height = 'auto';
      this.messageInput.nativeElement.value = '';
    }

    this.shouldScrollToBottom = true;
    this.isTyping.set(true);

    const loadingMsgId = this.generateId();
    const loadingMsg: ChatMessage = {
      id: loadingMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };
    this.messages.update(m => [...m, loadingMsg]);

    try {
      const resObj = await this.callAiApi(text, files, this.messages().slice(0, -1));
      this.messages.update(m => m.filter(msg => msg.id !== loadingMsgId));

      this.messages.update(m => [...m, {
        id: this.generateId(),
        role: 'assistant',
        content: resObj.content,
        data: resObj.data,
        timestamp: new Date(),
      }]);
    } catch {
      this.messages.update(m => m.filter(msg => msg.id !== loadingMsgId));
      this.messages.update(m => [...m, {
        id: this.generateId(),
        role: 'assistant',
        content: 'მოხდა შეცდომა. გთხოვთ სცადოთ თავიდან.',
        timestamp: new Date(),
        isError: true,
      }]);
    } finally {
      this.isTyping.set(false);
      this.shouldScrollToBottom = true;
    }
  }

  private async callAiApi(
    text: string,
    files: AttachedFile[],
    history: ChatMessage[]
  ): Promise<{ content: string; data?: AiStructuredResponse }> {

    const cleanedHistory = history
      .filter(m => !m.isLoading && !m.isError)
      .map(m => ({
        role: m.role,
        content: m.content,
      }));

    const fileList = files.map(f => f.file);

    const res: any = await new Promise((resolve, reject) => {
      this.aiService.chat(text, fileList, cleanedHistory).subscribe({
        next: resolve,
        error: reject,
      });
    });

    const response = res?.response as AiStructuredResponse;
    const comment = res?.comment;

    // If we have a structured response with topJobs, we prioritize that data
    if (response) {
      return {
        content: comment || response.summary || '',
        data: response
      };
    }

    return {
      content: comment || res?.reply || res?.message || res?.content || String(res) || '',
      data: undefined
    };
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

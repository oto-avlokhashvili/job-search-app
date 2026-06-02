import {
  Component,
  inject,
  ViewChild,
  ElementRef,
  computed,
  OnInit,
  signal,
  effect,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateStore } from '../../../Store/state.store';
import { ChatStore } from '../../../Store/chat.store';
import { ActivatedRoute, Router } from '@angular/router';
import { Ai } from '../../../Core/Services/ai';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { QrModal } from '../dashboard/qr-modal/qr-modal';
import { AuthService } from '../../../Core/Services/auth-service';
import { environment } from '../../../../environments/environment';
import { JobsService } from '../../../Core/Services/jobs-service';

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
  host: {
    '[class.has-results]': 'showJobs()',
  },
})
export class Chat implements OnInit {
  @ViewChild('fileInput') private fileInput!: ElementRef<HTMLInputElement>;

  stateStore = inject(StateStore);
  chatStore = inject(ChatStore);
  route = inject(ActivatedRoute);
  router = inject(Router);
  aiService = inject(Ai);
  authService = inject(AuthService);
  jobService = inject(JobsService);
  private dialog = inject(MatDialog);

  inputText = signal<string>('');
  attachedFiles = signal<AttachedFile[]>([]);
  isTyping = signal<boolean>(false);
  isDragOver = signal<boolean>(false);
  showJobs = computed(() => this.stateStore.chatShowJobs());
  telegramLink = signal<string>('');

  matchedJobs = computed(() => this.stateStore.chatMatchedJobs());
  aiSummary = computed(() => this.stateStore.chatAiSummary());
  aiDetectedRole = computed(() => this.stateStore.chatAiDetectedRole());
  aiLocationPreference = computed(() => this.stateStore.chatAiLocationPreference());
  aiPrimarySkills = computed(() => this.stateStore.chatAiPrimarySkills());

  cvSummary = computed(() => this.stateStore.userCv()?.summary);

  maxFileSizeMB = 10;
  allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  constructor() {
    // Automatically manage attachedFiles representing current CV in StateStore
    effect(() => {
      const cv = this.stateStore.userCv();
      if (!cv) {
        untracked(() => {
          this.attachedFiles.update(files => files.filter(f => f.id !== '__cv__'));
        });
        return;
      }

      const hasRealFile = untracked(() => {
        const current = this.attachedFiles().find(f => f.id === '__cv__');
        return current && current.file.size > 0;
      });

      if (hasRealFile) return;

      const fileName = cv.originalName ?? 'CV.pdf';
      const mimeType = cv.mimeType ?? 'application/pdf';
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

  ngOnInit() {
    //this.stateStore.getCv();
    //this.stateStore.loadProfile();
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

    this.stateStore.uploadCv(file);
  }

  removeAttachment(id: string) {
    this.attachedFiles.update(files => files.filter(f => f.id !== id));
    this.stateStore.deleteCv();
  }

  getFileIcon(type: string): string {
    if (type === 'application/pdf') return '📄';
    if (type.includes('word')) return '📝';
    return '📎';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  setPrompt(prompt: string) {
    this.inputText.set(prompt);
  }

  async search() {
    if (this.isTyping() || this.stateStore.cvLoading()) return;

    // Check query text: if not empty and not already present, we can add it to the state store
    const query = this.inputText().trim();
    if (query) {
      const existing = this.stateStore.searchQuery() ?? [];
      if (!existing.includes(query)) {
        this.stateStore.updateSearchQueries([...existing, query]);
      }
    }

    this.isTyping.set(true);

    try {
      const res: any = await firstValueFrom(this.aiService.searchJobsWithAi());
      this.stateStore.getCv();

      const jobs = res?.response?.topJobs || res?.response || [];
      const comment = res?.comment || res?.response?.summary || '';

      let role = '';
      let location = '';
      let skills: string[] = [];

      const profile = res?.response?.candidateProfile;
      if (profile) {
        role = profile.detectedRole || '';
        location = profile.locationPreference || '';
        skills = profile.primarySkills || [];
      } else {
        const cvSummary = this.stateStore.userCv()?.summary;
        role = cvSummary?.detectedRole || '';
        location = cvSummary?.locationPreference || '';
        skills = cvSummary?.primarySkills || [];
      }

      this.stateStore.updateChatSearchResults(jobs, comment, role, location, skills, true);

      if (Array.isArray(jobs) && jobs.length > 0) {
        const userId = this.stateStore.profile().id;
        const payload = jobs.map((job: any) => ({
          userId,
          jobId: job.id,
          vacancy: job.vacancy,
          location: job.location,
          company: job.company,
          match: job.match,
          salaryRange: job.salaryRange,
        }));
        await firstValueFrom(this.jobService.markAsSentBulk(payload));
      }
    } catch (err) {
      console.error('Job search failed:', err);
    } finally {
      this.isTyping.set(false);
    }
  }

  async generateTelegramToken() {
    const res = await this.authService.generateTelegramToken();
    this.telegramLink.set(`${environment.telegramUrl}?start=${res}`);
    if (res) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        window.location.href = this.telegramLink();
      } else {
        this.openDialog(this.telegramLink());
      }
    }
  }

  openDialog(link: string) {
    const dialogRef = this.dialog.open(QrModal, {
      width: '400px',
      disableClose: true,
      autoFocus: false,
      data: { telegramLink: link },
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.stateStore.loadProfile();
      }
    });
  }

  addKeyword(input: HTMLInputElement) {
    const value = input.value?.trim();
    if (!value) return;
    const existing = this.stateStore.searchQuery() ?? [];
    if (!existing.includes(value)) {
      this.stateStore.updateSearchQueries([...existing, value]);
    }
    input.value = '';
  }

  removeKeyword(index: number) {
    const existing = this.stateStore.searchQuery() ?? [];
    this.stateStore.updateSearchQueries(existing.filter((_: any, i: number) => i !== index));
  }
}

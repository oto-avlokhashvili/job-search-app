import { Component, Inject, inject, OnInit, Optional, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Job } from '../../../Core/Interfaces/jobs';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { AuthService } from '../../../Core/Services/auth-service';
import { StateStore } from '../../../Store/state.store';

import { extractSalary } from '../../../Core/Utils/salary-extractor';

@Component({
  selector: 'app-vacancy-details',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './vacancy-details.html',
  styleUrl: './vacancy-details.scss'
})
export class VacancyDetails implements OnInit {
  public alertify = inject(AlertifyService);
  public authService = inject(AuthService);
  public stateStore = inject(StateStore);

  extractedEmail = computed(() => {
    const job = this.stateStore.selectedJob() || this.data?.job;
    if (!job) return null;
    
    if ((job as any).email && typeof (job as any).email === 'string') {
      return (job as any).email;
    }

    const textToSearch = `${job.description || ''} ${job.requirements || ''}`;
    const match = textToSearch.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    return match ? match[1] : null;
  });

  extractedSalary = computed(() => {
    const job = this.stateStore.selectedJob() || this.data?.job;
    return extractSalary(job);
  });

  constructor(
    @Optional() public dialogRef?: MatDialogRef<VacancyDetails>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data?: { jobId: number | string; job?: Job }
  ) {}

  ngOnInit() {
    if (this.data?.jobId) {
      this.stateStore.loadJobById(this.data.jobId);
    }
  }

  copyEmail(email: string) {
    navigator.clipboard.writeText(email).then(() => {
      this.alertify.success('ელ-ფოსტა დაკოპირდა: ' + email);
    }).catch(() => {
      this.alertify.error('ელ-ფოსტის დაკოპირება ვერ მოხერხდა');
    });
  }

  close() {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  copyLink() {
    const job = this.stateStore.selectedJob();
    const url = window.location.origin + '/home?jobId=' + (job?.id || this.data?.jobId || '');
    navigator.clipboard.writeText(url).then(() => {
      this.alertify.success('ვაკანსიის ბმული დაკოპირდა');
    }).catch(() => {
      this.alertify.error('ბმულის დაკოპირება ვერ მოხერხდა');
    });
  }

  openOriginalSource(link?: string) {
    const targetLink = link || this.stateStore.selectedJob()?.link;
    if (targetLink && targetLink !== '/jobs') {
      window.open(targetLink, '_blank');
    } else {
      this.alertify.warning('ორიგინალი ბმული ხელმისაწვდომი არ არის');
    }
  }

  detectSource(link?: string): string {
    if (!link) return 'JobSearch';
    const l = link.toLowerCase();
    if (l.includes('jobs.ge')) return 'jobs.ge';
    if (l.includes('hr.ge')) return 'hr.ge';
    if (l.includes('awork.ge') || l.includes('awork')) return 'awork.ge';
    return 'სხვა წყარო';
  }

  formatDate(dateStr: any): string {
    if (!dateStr) return 'მითითებული არ არის';
    try {
      let date: Date;
      if (typeof dateStr === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateStr.trim())) {
        return dateStr.trim();
      } else {
        date = new Date(dateStr);
      }

      if (isNaN(date.getTime())) return dateStr;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  }
}

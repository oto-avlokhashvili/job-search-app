import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AlertifyService } from '../../../Core/Services/alertify.service';
import { HrAccount } from '../../../Core/Interfaces/hr';
import { HrStore } from '../../../Store/hr.store';

// Admin only: approve or revoke HR accounts. The list is kept in HrStore between visits.
@Component({
  selector: 'app-hr-admin',
  imports: [DatePipe],
  templateUrl: './hr-admin.html',
  styleUrl: './hr-admin.scss',
})
export class HrAdmin implements OnInit {
  private hrStore = inject(HrStore);
  private alertify = inject(AlertifyService);

  accounts = this.hrStore.accounts;
  loading = computed(() => this.hrStore.accountsLoading() && !this.hrStore.accountsLoaded());
  busyId = signal<number | null>(null);
  pending = computed(() => this.accounts().filter((a) => !a.hrApproved));
  approved = computed(() => this.accounts().filter((a) => a.hrApproved));

  async ngOnInit() {
    try {
      await this.hrStore.loadAccounts();
    } catch {
      this.alertify.error('HR ანგარიშების ჩატვირთვა ვერ მოხერხდა');
    }
  }

  async setApproval(account: HrAccount, approved: boolean) {
    this.busyId.set(account.id);
    try {
      await this.hrStore.setApproval(account, approved);
      this.alertify.success(approved ? 'ანგარიში დადასტურდა' : 'დადასტურება გაუქმდა');
    } catch {
      this.alertify.error('ცვლილება ვერ შეინახა');
    } finally {
      this.busyId.set(null);
    }
  }
}

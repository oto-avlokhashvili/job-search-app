import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { StateStore } from '../../../../Store/state.store';
import { AlertifyService } from '../../../../Core/Services/alertify.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../../environments/environment';

interface Plan {
  key: 'PRO' | 'PREMIUM';
  name: string;
  price: string;
  period: string;
  badge?: string;
  features: string[];
}

@Component({
  selector: 'app-subscription-modal',
  imports: [CommonModule, MatDialogModule],
  templateUrl: './subscription-modal.html',
  styleUrl: './subscription-modal.scss',
})
export class SubscriptionModal {
  dialogRef = inject(MatDialogRef<SubscriptionModal>);
  stateStore = inject(StateStore);
  alertify = inject(AlertifyService);
  http = inject(HttpClient);
  store = inject(StateStore);
  loading = signal<string | null>(null);

  plans: Plan[] = [
    {
      key: 'PRO',
      name: 'Pro',
      price: '8',
      period: '/თვე',
      badge: 'რეკომენდირებული',
      features: [
        'შეუზღუდავი ძიება',
        'AI რეზიუმეს ოპტიმიზაცია',
        'პრიორიტეტული მხარდაჭერა',
        'სტატისტიკა და ანალიტიკა',
      ],
    },
    {
      key: 'PREMIUM',
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      features: [
        'API წვდომა',
        'პერსონალური მენეჯერი',
        'გუნდური მართვა',
        'ყველა Pro შესაძლებლობა',
      ],
    },
  ];

  async activate(plan: Plan) {
    if (plan.key === 'PREMIUM') return;

    this.loading.set(plan.key);
    await this.store.updateProfile(this.store.profile().id, { subscription: plan.key });
    this.close();
  }

  close() {
    this.dialogRef.close(false);
  }
}

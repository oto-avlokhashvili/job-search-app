import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { StateStore } from '../../../../Store/state.store';
import { AlertifyService } from '../../../../Core/Services/alertify.service';
import { SubscriptionPlan } from '../../../../Core/Interfaces/user';

interface Plan {
  key: SubscriptionPlan | 'PREMIUM';
  name: string;
  price: string;
  period: string;
  badge?: string;
  features: string[];
}

@Component({
  selector: 'app-subscription-modal',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './subscription-modal.html',
  styleUrl: './subscription-modal.scss',
})
export class SubscriptionModal {
  dialogRef = inject(MatDialogRef<SubscriptionModal>);
  stateStore = inject(StateStore);
  alertify = inject(AlertifyService);
  loading = signal<string | null>(null);

  plans: Plan[] = [
    {
      key: 'BASIC',
      name: 'Basic',
      price: '4',
      period: '/თვე',
      features: [
        'ყოველდღიური Telegram შეტყობინებები',
        '10 შესაბამისი ვაკანსია დღეში',
        'საბაზისო CV ანალიზი',
      ],
    },
    {
      key: 'PRO',
      name: 'Pro',
      price: '8',
      period: '/თვე',
      badge: 'რეკომენდირებული',
      features: [
        'შეუზღუდავი AI ძიება & ანალიზი',
        'AI რეზიუმეს ოპტიმიზაცია & ხელფასის ანალიზი',
        'ყოველდღიური Email & Telegram შეტყობინებები',
        'პრიორიტეტული AI შესაბამისობის ქულები',
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
    try {
      await this.stateStore.assignSubscriptionPlan(plan.key);
      this.alertify.success(`გეგმა ${plan.name} წარმატებით გააქტიურდა!`);
      this.close();
    } catch (err) {
      this.alertify.error('გეგმის გააქტიურება ვერ მოხერხდა');
    } finally {
      this.loading.set(null);
    }
  }

  close() {
    this.dialogRef.close(false);
  }
}

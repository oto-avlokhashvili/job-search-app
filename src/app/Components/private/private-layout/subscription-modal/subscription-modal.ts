import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { StateStore } from '../../../../Store/state.store';
import { AlertifyService } from '../../../../Core/Services/alertify.service';
import { WaitlistService } from '../../../../Core/Services/waitlist.service';
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
  waitlistService = inject(WaitlistService);
  loading = signal<string | null>(null);

  plans: Plan[] = [
    {
      key: 'BASIC',
      name: 'Basic პაკეტი',
      price: '0',
      period: '/სამუდამოდ',
      badge: 'უფასო',
      features: [
        'CV-ს ატვირთვა',
        'ვაკანსიების ძიება საძიებო სიტყვებით',
        'შეტყობინებების მიღება Telegram-ზე',
        'ბარათის დამატება არ არის საჭირო',
      ],
    },
    {
      key: 'PRO',
      name: 'Pro პაკეტი',
      price: '8',
      period: '/თვე',
      badge: 'მალე დაემატება',
      features: [
        'CV-ს ატვირთვა',
        'ვაკანსიების შეტყობინებების მიღება Email-ზე',
        'ვაკანსიებისა და CV-ს AI ანალიზი',
        'CV-ზე მორგებული და შეფასებული ვაკანსიების მიღება',
        'საძიებო სიტყვების AI ავტომატური გენერაცია',
      ],
    },
    {
      key: 'PREMIUM',
      name: 'Enterprise (კომპანიებისთვის)',
      price: 'შეთანხმებით',
      period: '',
      badge: 'HR & კომპანიები',

      features: [
        'HR & რეკრუტერების პანელი',
        'კანდიდატების AI მოძიება კონკრეტულ ვაკანსიებზე',
        'კანდიდატების CV-ების AI ანალიზი & Match Score',
        'ვაკანსიების მართვა & პირდაპირი კონტაქტი',
        'API ინტეგრაცია & პერსონალური მენეჯერი',
      ],
    },
  ];


  async activate(plan: Plan) {
    if (plan.key === 'PRO' || plan.key === 'PREMIUM') {
      if (this.waitlistService.isEnrolled(plan.key)) {
        this.alertify.success(`თქვენ უკვე დარეგისტრირებული ხართ ${plan.name} Waitlist-ში! 🎉`);
        return;
      }
      this.loading.set(plan.key);
      try {
        const res = await this.waitlistService.join({ plan: plan.key === 'PREMIUM' ? 'ENTERPRISE' : 'PRO', source: 'subscription_modal' });
        this.alertify.success(res.message || 'გმადლობთ! თქვენ წარმატებით დაემატეთ Waitlist-ში 🎉');
      } catch (err) {
        this.alertify.error('დაფიქსირდა შეცდომა');
      } finally {
        this.loading.set(null);
      }
      return;
    }

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


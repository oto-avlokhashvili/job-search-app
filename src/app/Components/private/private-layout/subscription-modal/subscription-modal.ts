import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { StateStore } from '../../../../Store/state.store';
import { AlertifyService } from '../../../../Core/Services/alertify.service';
import { WaitlistService } from '../../../../Core/Services/waitlist.service';
import { SubscriptionPlan } from '../../../../Core/Interfaces/user';

export interface Plan {
  key: SubscriptionPlan | 'PREMIUM';
  name: string;
  description: string;
  price: string;
  period: string;
  badge?: string;
  badgeClass?: string;
  featured?: boolean;
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
      description: 'სამუშაოს სწრაფი და მარტივი ძიებისთვის',
      price: '0',
      period: '/სამუდამოდ',
      badge: 'უფასო',
      badgeClass: 'badge-basic',
      features: [
        'CV-ს ატვირთვა და შენახვა',
        'ვაკანსიების ძიება საკვანძო სიტყვებით',
        'შეტყობინებების მიღება Telegram-ზე',
        'ბარათის დამატება არ არის საჭირო',
      ],
    },
    {
      key: 'PRO',
      name: 'Pro პაკეტი',
      description: 'AI ასისტენტი შენი კარიერული ზრდისთვის',
      price: '8',
      period: '/თვე',
      badge: 'მალე დაემატება',
      badgeClass: 'badge-pro',
      featured: true,
      features: [
        'CV-ს ატვირთვა & შეუზღუდავი ძიება',
        'ვაკანსიების შეტყობინებები Email-ზე',
        'ვაკანსიებისა და CV-ს AI ანალიზი',
        'CV-ზე მორგებული & შეფასებული ვაკანსიები',
        'საძიებო სიტყვების AI გენერაცია',
      ],
    },
    {
      key: 'PREMIUM',
      name: 'Enterprise',
      description: 'HR & კომპანიების სრული AI პლატფორმა',
      price: 'შეთანხმებით',
      period: '',
      badge: 'HR & კომპანიები',
      badgeClass: 'badge-enterprise',
      features: [
        'HR & რეკრუტერების სამართავი პანელი',
        'კანდიდატების AI მოძიება ვაკანსიებზე',
        'კანდიდატების CV-ების AI Match Score',
        'ვაკანსიების მართვა & პირდაპირი კონტაქტი',
        'API ინტეგრაცია & პერსონალური მენეჯერი',
      ],
    },
  ];

  isWaitlistEnrolled(planKey: string): boolean {
    const key = planKey === 'PREMIUM' ? 'ENTERPRISE' : 'PRO';
    return this.waitlistService.isEnrolled(key);
  }

  async activate(plan: Plan) {
    if (plan.key === 'PRO' || plan.key === 'PREMIUM') {
      const waitlistKey = plan.key === 'PREMIUM' ? 'ENTERPRISE' : 'PRO';
      if (this.waitlistService.isEnrolled(waitlistKey)) {
        this.alertify.success(`თქვენ უკვე დარეგისტრირებული ხართ ${plan.name} Waitlist-ში! 🎉`);
        return;
      }
      this.loading.set(plan.key);
      try {
        const res = await this.waitlistService.join({
          plan: waitlistKey,
          source: 'subscription_modal',
        });
        this.alertify.success(res.message || 'გმადლობთ! თქვენ წარმატებით დაემატეთ Waitlist-ში 🎉');
      } catch (err) {
        this.alertify.error('დაფიქსირდა შეცდომა');
      } finally {
        this.loading.set(null);
      }
      return;
    }

    if (this.stateStore.plan() === plan.key) {
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

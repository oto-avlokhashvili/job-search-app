import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { StateStore } from '../../Store/state.store';

export interface JoinWaitlistPayload {
  email?: string;
  plan: 'PRO' | 'ENTERPRISE' | string;
  source?: string;
  notes?: string;
}

export interface JoinWaitlistResponse {
  success: boolean;
  message: string;
  alreadyJoined: boolean;
  data: any;
}

@Injectable({
  providedIn: 'root',
})
export class WaitlistService {
  private http = inject(HttpClient);
  private stateStore = inject(StateStore);
  private url = `${environment.apiUrl}/subscription/waitlist`;

  // Signals to track local enrolled status
  enrolledPlans = signal<string[]>(this.loadEnrolledPlans());

  private loadEnrolledPlans(): string[] {
    try {
      const saved = localStorage.getItem('waitlist_enrolled_plans');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  isEnrolled(plan: string = 'PRO'): boolean {
    return this.enrolledPlans().includes(plan.toUpperCase());
  }

  markEnrolled(plan: string = 'PRO') {
    const p = plan.toUpperCase();
    if (!this.enrolledPlans().includes(p)) {
      const updated = [...this.enrolledPlans(), p];
      this.enrolledPlans.set(updated);
      try {
        localStorage.setItem('waitlist_enrolled_plans', JSON.stringify(updated));
      } catch {}
    }
  }

  async join(payload: JoinWaitlistPayload): Promise<JoinWaitlistResponse> {
    const userEmail = payload.email || this.stateStore.profile()?.email || undefined;
    const finalPayload: JoinWaitlistPayload = {
      ...payload,
      email: userEmail,
    };

    const res = await firstValueFrom(
      this.http.post<JoinWaitlistResponse>(this.url, finalPayload, { withCredentials: true })
    );
    if (res?.success) {
      this.markEnrolled(payload.plan);
    }
    return res;
  }
}


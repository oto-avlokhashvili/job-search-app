import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { SubscriptionDetails, SubscriptionPlan } from '../Interfaces/user';
import { skipLoading } from '../loading/skip-loading.component';

export interface MySubscriptionResponse {
  effectivePlan: SubscriptionPlan | null;
  subscriptionDetails: SubscriptionDetails | null;
  features: {
    maxDailyJobs: number;
    aiModel: string;
    includeSalaryAnalysis: boolean;
    enableTelegramAlerts: boolean;
    enableEmailAlerts: boolean;
    canUseAiChat: boolean;
    canUseAiJobSearch: boolean;
  };
}

export interface AssignPlanPayload {
  plan: SubscriptionPlan;
  durationDays?: number;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SubscriptionService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.apiUrl;

  /**
   * Fetches the current logged-in user's subscription details and effective capabilities.
   */
  getMySubscription(): Observable<MySubscriptionResponse> {
    return this.http.get<MySubscriptionResponse>(`${this.url}/subscription/me`, {
      withCredentials: true,
      context: new HttpContext().set(skipLoading, true),
    });
  }

  /**
   * Assigns, upgrades, or activates a plan for a user.
   */
  assignPlan(
    userId: number,
    plan: SubscriptionPlan,
    durationDays: number = 30,
  ): Observable<SubscriptionDetails> {
    const payload: AssignPlanPayload = { plan, durationDays };
    return this.http.patch<SubscriptionDetails>(
      `${this.url}/subscription/assign/${userId}`,
      payload,
      {
        withCredentials: true,
        context: new HttpContext().set(skipLoading, true),
      },
    );
  }

  /**
   * Cancels the current user's subscription.
   */
  cancelSubscription(cancelImmediately: boolean = false): Observable<SubscriptionDetails> {
    return this.http.post<SubscriptionDetails>(
      `${this.url}/subscription/cancel`,
      { cancelImmediately },
      {
        withCredentials: true,
        context: new HttpContext().set(skipLoading, true),
      },
    );
  }
}

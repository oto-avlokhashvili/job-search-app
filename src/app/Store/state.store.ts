import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed, inject } from "@angular/core";
import { JobsService } from '../Core/Services/jobs-service';
import { AuthService } from '../Core/Services/auth-service';
import { User, SubscriptionPlan, SubscriptionDetails } from '../Core/Interfaces/user';
import { firstValueFrom } from 'rxjs';
import { AiMatchedJobsResponse, Job, SentJobsResponse } from '../Core/Interfaces/jobs';
import { Users } from '../Core/Services/users';
import { Ai } from '../Core/Services/ai';
import { Cv } from '../Core/Services/cv';
import { SubscriptionService } from '../Core/Services/subscription.service';

type State = {
    profile: User;
    profileLoaded: boolean;

    matchedJobsCount: number | 0;
    sentJobsCount: number | 0;
    matchedJobsDashboard: AiMatchedJobsResponse;
    matchedJobsLoading: boolean;
    matchedJobsLoaded: boolean;
    sentJobs: SentJobsResponse;
    sentJobsLoading: boolean;
    sentJobsLoaded: boolean;
    searchQuery: string[];

    userCv: any;
    cvLoading: boolean;
    cvLoaded: boolean;

    chatMatchedJobs: any[];
    chatShowJobs: boolean;
    chatAiSummary: string;
    chatAiDetectedRole: string;
    chatAiLocationPreference: string;
    chatAiPrimarySkills: string[];

    cities: { location: string; count: number }[];
    citiesLoaded: boolean;
    citiesLoading: boolean;

    selectedJob: Job | null;
    selectedJobLoading: boolean;
    selectedJobError: string | null;
}

const initialState: State = {
    profile: { id: 0, firstName: '---', lastName: '---', email: '', subscriptionDetails: null, subscription: null, searchQuery: [], createdAt: '' },
    profileLoaded: false,
    matchedJobsCount: 0,
    sentJobsCount: 0,
    searchQuery: [],

    sentJobs: { sentJobs: [], total: 0, page: 1, lastPage: 1 },
    sentJobsLoading: false,
    sentJobsLoaded: false,
    matchedJobsDashboard: { data: [], total: 0, page: 1, lastPage: 1 },
    matchedJobsLoading: false,
    matchedJobsLoaded: false,

    userCv: null,
    cvLoading: false,
    cvLoaded: false,

    chatMatchedJobs: [],
    chatShowJobs: false,
    chatAiSummary: '',
    chatAiDetectedRole: '',
    chatAiLocationPreference: '',
    chatAiPrimarySkills: [],

    cities: [],
    citiesLoaded: false,
    citiesLoading: false,

    selectedJob: null,
    selectedJobLoading: false,
    selectedJobError: null,
}

let inFlightProfilePromise: Promise<void> | null = null;
let inFlightCvPromise: Promise<void> | null = null;

export const StateStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withComputed((store) => {
        const plan = computed(() => {
            const p = store.profile();
            return p?.subscriptionDetails?.plan ?? (p?.subscription as SubscriptionPlan) ?? null;
        });

        const isPro = computed(() => {
            const p = store.profile();
            const isSubActive = p?.subscriptionDetails?.status === 'ACTIVE' || p?.subscriptionDetails?.status === 'TRIALING';
            return (p?.subscriptionDetails?.plan === 'PRO' && isSubActive) || p?.subscription === 'PRO';
        });

        const isBasic = computed(() => {
            const p = store.profile();
            const isSubActive = p?.subscriptionDetails?.status === 'ACTIVE' || p?.subscriptionDetails?.status === 'TRIALING';
            return (p?.subscriptionDetails?.plan === 'BASIC' && isSubActive) || p?.subscription === 'BASIC';
        });

        const hasActiveSubscription = computed(() => {
            const p = store.profile();
            const sub = p?.subscriptionDetails;
            const isSubActive = sub?.status === 'ACTIVE' || sub?.status === 'TRIALING';
            return isSubActive || ['BASIC', 'PRO', 'PREMIUM'].includes(p?.subscription || '');
        });

        const hasCvStep = computed(() => !!store.userCv() && !store.cvLoading());
        const hasInfoStep = computed(() => {
            const p = store.profile();
            const queries = store.searchQuery() || [];
            const hasName = !!p?.firstName?.trim() && p?.firstName !== '---' && !!p?.lastName?.trim() && p?.lastName !== '---';
            const hasKeywords = isPro() ? true : (queries.length >= 1 || (p?.searchQuery && p.searchQuery.length >= 1));
            return hasName && hasKeywords;
        });
        const hasNotificationStep = computed(() => {
            const p = store.profile();
            const channelOk = isPro() ? !!p?.isEmailVerified : (!!p?.telegramChatId || !!p?.receiveMessages);
            return !!p?.receiveMessages || channelOk;
        });
        const hasSubscriptionStep = computed(() => {
            return hasActiveSubscription();
        });

        const onboardingPercentage = computed(() => {
            let score = 0;
            if (hasSubscriptionStep()) score += 25;
            if (hasCvStep()) score += 25;
            if (hasInfoStep()) score += 25;
            if (hasNotificationStep()) score += 25;
            return score;
        });

        const firstIncompleteStep = computed(() => {
            if (!hasSubscriptionStep()) return 1;
            if (!hasCvStep()) return 2;
            if (!hasInfoStep()) return 3;
            if (!hasNotificationStep()) return 4;
            return 1;
        });

        const isOnboardingCompleted = computed(() => {
            return hasSubscriptionStep() && hasCvStep() && hasInfoStep() && hasNotificationStep();
        });

        return {
            plan,
            isPro,
            isBasic,
            hasActiveSubscription,
            hasCvStep,
            hasInfoStep,
            hasNotificationStep,
            hasSubscriptionStep,
            onboardingPercentage,
            firstIncompleteStep,
            isOnboardingCompleted,
        };
    }),
    withMethods((store, authService = inject(AuthService), jobsService = inject(JobsService), userService = inject(Users), aiService = inject(Ai), cvService = inject(Cv), subscriptionService = inject(SubscriptionService)) => ({
        async loadProfile(force: boolean = false): Promise<void> {
            if (!force && store.profileLoaded() && store.profile().id !== 0) {
                return;
            }
            if (!force && inFlightProfilePromise) {
                return inFlightProfilePromise;
            }

            inFlightProfilePromise = (async () => {
                try {
                    const profile = await authService.getUserProfile();
                    patchState(store, {
                        profile,
                        profileLoaded: true,
                        searchQuery: (profile?.searchQuery && profile.searchQuery.length > 0) ? profile.searchQuery : (store.searchQuery() || [])
                    });
                } catch (err) {
                    console.error('Error loading profile:', err);
                } finally {
                    inFlightProfilePromise = null;
                }
            })();

            return inFlightProfilePromise;
        },

        updateProfile(id: number, data: any) {
            if (!id || !data || Object.keys(data).length === 0) return;

            const current = store.profile();
            let hasDifference = false;
            for (const key of Object.keys(data)) {
                if ((current as any)[key] !== data[key]) {
                    hasDifference = true;
                    break;
                }
            }

            patchState(store, {
                profile: { ...store.profile(), ...data }
            });

            // If the state already has these values saved, skip unnecessary network call
            if (!hasDifference) {
                return;
            }

            userService.getUserById(id, data).subscribe({
                next: (res) => {
                    patchState(store, {
                        profile: res
                    });
                },
                error: (err) => {
                    console.error('Error updating profile:', err);
                }
            });
        },

        async assignSubscriptionPlan(plan: SubscriptionPlan, durationDays: number = 30) {
            const user = store.profile();
            if (!user || !user.id) return;

            const fallbackDetails: SubscriptionDetails = {
                id: user.subscriptionDetails?.id || 'sub-local',
                userId: user.id,
                plan,
                status: 'ACTIVE',
                cancelAtPeriodEnd: false,
            };

            try {
                const res: any = await firstValueFrom(subscriptionService.assignPlan(user.id, plan, durationDays));
                const details = res?.subscriptionDetails || (res?.plan ? res : null);
                const updatedUser = res?.user || (res?.email ? res : null);

                if (updatedUser) {
                    patchState(store, {
                        profile: {
                            ...store.profile(),
                            ...updatedUser,
                            subscription: plan,
                            subscriptionDetails: details || updatedUser.subscriptionDetails || fallbackDetails,
                        }
                    });
                } else {
                    patchState(store, {
                        profile: {
                            ...store.profile(),
                            subscription: plan,
                            subscriptionDetails: details || fallbackDetails,
                        }
                    });
                }

                // Reload fresh profile from server to guarantee sync
                await this.loadProfile(true);
            } catch (err) {
                console.error('Error assigning subscription plan:', err);
                patchState(store, {
                    profile: {
                        ...store.profile(),
                        subscription: plan,
                        subscriptionDetails: fallbackDetails,
                    }
                });
                await this.loadProfile(true);
            }
        },

        updateLocalProfile(data: Partial<User>) {
            patchState(store, {
                profile: { ...store.profile(), ...data }
            });
        },

        async getCv(force: boolean = false): Promise<void> {
            // Ensure profile is always loaded before fetching CV
            if (!store.profileLoaded() || store.profile().id === 0 || inFlightProfilePromise) {
                await this.loadProfile();
            }

            if (!force && store.cvLoaded()) {
                return;
            }
            if (!force && inFlightCvPromise) {
                return inFlightCvPromise;
            }

            patchState(store, { cvLoading: true });

            inFlightCvPromise = (async () => {
                try {
                    // Double check profile readiness before triggering CV service call
                    if (!store.profileLoaded() || store.profile().id === 0 || inFlightProfilePromise) {
                        await this.loadProfile();
                    }
                    const res = await firstValueFrom(cvService.getCV());
                    patchState(store, { userCv: res, cvLoading: false, cvLoaded: true, searchQuery: res?.summary?.searchQueries ?? [] });
                } catch (err) {
                    patchState(store, { userCv: null, cvLoading: false, cvLoaded: true });
                    console.error('Error fetching CV:', err);
                } finally {
                    inFlightCvPromise = null;
                }
            })();

            return inFlightCvPromise;
        },


        async ensureDataLoaded(force: boolean = false): Promise<void> {
            if (force || !store.profileLoaded() || store.profile().id === 0) {
                await this.loadProfile(force);
            }
            if (force || !store.cvLoaded()) {
                await this.getCv(force);
            }
        },

        setSearchQueries(searchQuery: string[]) {
            patchState(store, { searchQuery });
        },

        async updateSearchQueries(searchQueries: string[], optimistic: boolean = false) {
            if (optimistic) {
                patchState(store, { searchQuery: searchQueries });
            }
            try {
                const res: any = await firstValueFrom(cvService.updateSearchQueries(searchQueries));
                if (res?.summary?.searchQueries) {
                    patchState(store, { searchQuery: res.summary.searchQueries });
                } else if (!optimistic) {
                    patchState(store, { searchQuery: searchQueries });
                }
                return res;
            } catch (err) {
                console.error('Error updating search queries:', err);
                throw err;
            }
        },

        updateChatSearchResults(jobs: any[], summary: string, role: string, location: string, skills: string[], show: boolean) {
            patchState(store, {
                chatMatchedJobs: jobs,
                chatAiSummary: summary,
                chatAiDetectedRole: role,
                chatAiLocationPreference: location,
                chatAiPrimarySkills: skills,
                chatShowJobs: show
            });
        },

        deleteCv() {
            patchState(store, { cvLoading: true });
            cvService.deleteCV().subscribe({
                next: () => {
                    patchState(store, { userCv: null, cvLoading: false });
                },
                error: (err) => {
                    patchState(store, { cvLoading: false });
                    console.error('Error deleting CV:', err);
                }
            });
        },

        uploadCv(file: File) {
            patchState(store, { cvLoading: true });
            cvService.upload(file).subscribe({
                next: (res) => {
                    patchState(store, { userCv: res, cvLoading: false });
                    cvService.getCV().subscribe({
                        next: (fullCv) => {
                            patchState(store, { userCv: fullCv, searchQuery: fullCv?.summary?.searchQueries ?? [] });
                        }
                    });
                },
                error: (err) => {
                    patchState(store, { cvLoading: false });
                    console.error('Error uploading CV:', err);
                }
            });
        },

        loadAIMatchedJobs(page: number = 1, limit: number = 5, force: boolean = false) {
            if (!force && (store.matchedJobsLoading() || (store.matchedJobsLoaded() && store.matchedJobsDashboard()?.data?.length > 0))) {
                return;
            }
            patchState(store, { matchedJobsLoading: true });
            aiService.getAiMatchedJobs(page, limit).subscribe({
                next: (res: AiMatchedJobsResponse) => {
                    patchState(store, {
                        matchedJobsDashboard: res,
                        matchedJobsLoaded: true,
                        matchedJobsLoading: false
                    });

                    animateValue(0, res.total, 400, v =>
                        patchState(store, { matchedJobsCount: v })
                    );
                },
                error: (err: any) => {
                    patchState(store, { matchedJobsLoading: false });
                    console.error('Error loading AI matched jobs:', err);
                }
            });
        },

        loadSentJobs(page: number = 1, take: number = 10, force: boolean = false) {
            if (!force && (store.sentJobsLoading() || (store.sentJobsLoaded() && store.sentJobs()?.page === page))) {
                return;
            }
            patchState(store, { sentJobsLoading: true });
            jobsService.getUserSentJobs(page, take).subscribe({
                next: (res: any) => {
                    patchState(store, {
                        sentJobs: res,
                        sentJobsLoaded: true,
                        sentJobsLoading: false
                    });
                    animateValue(0, res.total, 400, v =>
                        patchState(store, { sentJobsCount: v })
                    );
                },
                error: (err: any) => {
                    patchState(store, { sentJobsLoading: false });
                    console.error('Error loading sent jobs:', err);
                }
            });
        },

        loadCities(force: boolean = false) {
            if (!force && store.citiesLoaded() && store.cities().length > 0) {
                return;
            }
            patchState(store, { citiesLoading: true });
            jobsService.getCities().subscribe({
                next: (res) => {
                    patchState(store, {
                        cities: res || [],
                        citiesLoaded: true,
                        citiesLoading: false
                    });
                },
                error: (err) => {
                    patchState(store, { citiesLoading: false });
                    console.error('Error loading cities:', err);
                }
            });
        },

        loadJobById(id: number | string) {
            patchState(store, { selectedJobLoading: true, selectedJobError: null });
            jobsService.getJobById(id).subscribe({
                next: (res: any) => {
                    const loadedJob = res?.job || res;
                    if (loadedJob && (loadedJob.id || loadedJob.vacancy)) {
                        patchState(store, { selectedJob: loadedJob, selectedJobLoading: false, selectedJobError: null });
                    } else {
                        patchState(store, { selectedJob: null, selectedJobLoading: false, selectedJobError: 'ვაკანსიის მონაცემები ვერ მოიძებნა' });
                    }
                },
                error: (err: any) => {
                    console.error('Error loading job by ID:', err);
                    patchState(store, { selectedJob: null, selectedJobLoading: false, selectedJobError: 'ვაკანსიის ჩატვირთვისას დაფიქსირდა შეცდომა ან ვაკანსია ვერ მოიძებნა' });
                }
            });
        },

        clearSelectedJob() {
            patchState(store, { selectedJob: null, selectedJobLoading: false, selectedJobError: null });
        }
    })),
);

export function animateValue(start: number, end: number, duration: number, onUpdate: (val: number) => void) {
    const startTime = performance.now();
    const step = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        onUpdate(Math.round(start + (end - start) * eased));
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}
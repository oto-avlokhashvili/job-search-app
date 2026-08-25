import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { computed, inject } from "@angular/core";
import { JobsService } from '../Core/Services/jobs-service';
import { AuthService } from '../Core/Services/auth-service';
import { User } from '../Core/Interfaces/user';
import { firstValueFrom } from 'rxjs';
import { AiMatchedJobsResponse, Job, SentJobsResponse } from '../Core/Interfaces/jobs';
import { Users } from '../Core/Services/users';
import { Ai } from '../Core/Services/ai';
import { Cv } from '../Core/Services/cv';

type State = {
    profile: User;
    profileLoaded: boolean;

    matchedJobsCount: number | 0;
    sentJobsCount: number | 0;
    matchedJobsDashboard: AiMatchedJobsResponse;
    sentJobs: SentJobsResponse;
    searchQuery: string[];

    userCv: any;
    cvLoading: boolean;

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
    profile: { id: 0, firstName: '---', lastName: '---', email: '', subscription: 'BASIC', searchQuery: [], createdAt: '' },
    profileLoaded: false,
    matchedJobsCount: 0,
    sentJobsCount: 0,
    searchQuery: [],

    sentJobs: { sentJobs: [], total: 0, page: 1, lastPage: 1 },
    matchedJobsDashboard: { data: [], total: 0, page: 1, lastPage: 1 },

    userCv: null,
    cvLoading: false,

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

export const StateStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withComputed((store) => {
        const hasCvStep = computed(() => !!store.userCv() && !store.cvLoading());
        const hasInfoStep = computed(() => {
            const p = store.profile();
            const queries = store.searchQuery() || [];
            const hasName = !!p?.firstName?.trim() && p?.firstName !== '---' && !!p?.lastName?.trim() && p?.lastName !== '---';
            const hasKeywords = queries.length > 0;
            return hasName && hasKeywords;
        });
        const hasNotificationStep = computed(() => {
            const p = store.profile();
            return !!p?.receiveMessages && (!!p?.isEmailVerified || !!p?.telegramChatId);
        });
        const hasSubscriptionStep = computed(() => {
            const p = store.profile();
            return !!p?.subscription && ['BASIC', 'PRO', 'PREMIUM'].includes(p.subscription);
        });

        const onboardingPercentage = computed(() => {
            let score = 0;
            if (hasCvStep()) score += 25;
            if (hasInfoStep()) score += 25;
            if (hasNotificationStep()) score += 25;
            if (hasSubscriptionStep()) score += 25;
            return score;
        });

        const firstIncompleteStep = computed(() => {
            if (!hasCvStep()) return 1;
            if (!hasInfoStep()) return 2;
            if (!hasNotificationStep()) return 3;
            if (!hasSubscriptionStep()) return 5;
            return 1;
        });

        const isOnboardingCompleted = computed(() => {
            return hasCvStep() && hasInfoStep() && hasNotificationStep() && hasSubscriptionStep();
        });

        return {
            hasCvStep,
            hasInfoStep,
            hasNotificationStep,
            hasSubscriptionStep,
            onboardingPercentage,
            firstIncompleteStep,
            isOnboardingCompleted,
        };
    }),
    withMethods((store, authService = inject(AuthService), jobsService = inject(JobsService), userService = inject(Users), aiService = inject(Ai), cvService = inject(Cv)) => ({
        async loadProfile(force: boolean = false) {
            if (!force && store.profileLoaded() && store.profile().id !== 0) {
                return;
            }
            try {
                const profile = await authService.getUserProfile();
                patchState(store, {
                    profile, profileLoaded: true
                });
            } catch (err) {
                console.error('Error loading profile:', err);
            }
        },

        updateProfile(id: number, data: any) {
            patchState(store, {
                profile: { ...store.profile(), ...data }
            });
            userService.getUserById(id, data).subscribe(res => {
                patchState(store, {
                    profile: res
                });
            });
        },

        updateLocalProfile(data: Partial<User>) {
            patchState(store, {
                profile: { ...store.profile(), ...data }
            });
        },

        async getCv(force: boolean = false) {
            if (!force && store.userCv() !== null && !!store.userCv()?.summary) {
                return;
            }
            patchState(store, { cvLoading: true });
            try {
                const res = await firstValueFrom(cvService.getCV());
                patchState(store, { userCv: res, cvLoading: false, searchQuery: res?.summary?.searchQueries ?? [] });
            } catch (err) {
                patchState(store, { cvLoading: false });
                console.error('Error fetching CV:', err);
            }
        },

        setSearchQueries(searchQuery: string[]) {
            patchState(store, { searchQuery });
        },

        updateSearchQueries(searchQueries: string[]) {
            // Optimistic update
            patchState(store, { searchQuery: searchQueries });
            cvService.updateSearchQueries(searchQueries).subscribe({
                next: (res) => {
                    if (res?.summary?.searchQueries) {
                        patchState(store, { searchQuery: res.summary.searchQueries });
                    }
                },
                error: (err) => {
                    console.error('Error updating search queries:', err);
                }
            });
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
            if (!force && store.matchedJobsDashboard()?.data?.length > 0) {
                return;
            }
            aiService.getAiMatchedJobs(page, limit).subscribe({
                next: (res: AiMatchedJobsResponse) => {
                    patchState(store, {
                        matchedJobsDashboard: res,
                    });

                    animateValue(0, res.total, 400, v =>
                        patchState(store, { matchedJobsCount: v })
                    );
                },
                error: (err: any) => {
                    console.error('Error loading AI matched jobs:', err);
                }
            });
        },

        loadSentJobs(page: number = 1, take: number = 10, force: boolean = false) {
            if (!force && store.sentJobs()?.sentJobs?.length > 0) {
                return;
            }
            jobsService.getUserSentJobs(page, take).subscribe({
                next: (res: any) => {
                    patchState(store, {
                        sentJobs: res
                    });
                    animateValue(0, res.total, 400, v =>
                        patchState(store, { sentJobsCount: v })
                    );
                },
                error: (err: any) => {
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
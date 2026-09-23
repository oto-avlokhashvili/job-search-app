import { signalStore, withState, withMethods, patchState, withComputed, withHooks } from '@ngrx/signals';
import { computed, inject } from "@angular/core";
import { JobsService } from '../Core/Services/jobs-service';
import { AuthService } from '../Core/Services/auth-service';
import { User, SubscriptionPlan, SubscriptionDetails } from '../Core/Interfaces/user';
import { firstValueFrom } from 'rxjs';
import { AiMatchedJobsResponse, Job, SentJobsResponse, VacancyItem } from '../Core/Interfaces/jobs';
import { SystemStats } from '../Core/Interfaces/stats';
import { Users } from '../Core/Services/users';
import { Ai } from '../Core/Services/ai';
import { Cv } from '../Core/Services/cv';
import { SubscriptionService } from '../Core/Services/subscription.service';
import { extractSalary } from '../Core/Utils/salary-extractor';

export const JOBUP_SOURCE = 'jobup.ge';
export const JOBUP_LOGO = '/favicon/favicon-96x96.png';

// Vacancies posted on Job Up itself (not scraped from an external portal)
export function isJobUpJob(sourceOrLink?: string, linkFallback?: string, company?: string): boolean {
    const l = `${sourceOrLink || ''} ${linkFallback || ''}`.toLowerCase();
    const c = (company || '').toLowerCase().replace(/[\s_-]/g, '');
    return l.includes('jobup') || c === 'jobup' || c === 'jobup.ge';
}

export function detectJobSource(sourceOrLink?: string, linkFallback?: string, company?: string): string {
    if (isJobUpJob(sourceOrLink, linkFallback, company)) return JOBUP_SOURCE;
    const l = `${sourceOrLink || ''} ${linkFallback || ''}`.toLowerCase();
    if (l.includes('myjobs.ge') || l.includes('myjobs') || l.includes('myjob')) return 'myjobs.ge';
    if (l.includes('jobs.ge') || l.includes('jobsge')) return 'jobs.ge';
    if (l.includes('hr.ge') || l.includes('hrge')) return 'hr.ge';
    if (l.includes('awork.ge') || l.includes('awork')) return 'awork.ge';
    return 'other';
}

export function formatJobDate(dateStr: any): string {
    if (!dateStr) return 'დღეს';
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

    publicJobs: VacancyItem[];
    publicJobsTotal: number;
    publicDbTotal: number;
    publicJobsGeCount: number;
    publicHrGeCount: number;
    publicAworkGeCount: number;
    publicMyjobsGeCount: number;
    publicJobsLoaded: boolean;
    publicJobsLoading: boolean;
    publicJobsAppending: boolean;
    publicJobsPage: number;
    publicHasMore: boolean;
    publicJobsQuery: string;
    publicJobsSource: string;
    publicJobsLocation: string;
    publicJobsDateRange: string;

    stats: SystemStats | null;
    statsLoaded: boolean;
    statsLoading: boolean;
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

    publicJobs: [],
    publicJobsTotal: 0,
    publicDbTotal: 0,
    publicJobsGeCount: 0,
    publicHrGeCount: 0,
    publicAworkGeCount: 0,
    publicMyjobsGeCount: 0,
    publicJobsLoaded: false,
    publicJobsLoading: false,
    publicJobsAppending: false,
    publicJobsPage: 1,
    publicHasMore: true,
    publicJobsQuery: '',
    publicJobsSource: 'all',
    publicJobsLocation: 'all',
    publicJobsDateRange: 'all',

    stats: null,
    statsLoaded: false,
    statsLoading: false,
}

let inFlightProfilePromise: Promise<void> | null = null;
let inFlightCvPromise: Promise<void> | null = null;
let inFlightStatsPromise: Promise<void> | null = null;

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

        uploadCv(file: File, consent: boolean = true) {
            patchState(store, { cvLoading: true });
            cvService.upload(file, consent).subscribe({
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
        },

        async loadPublicJobs(params?: {
            query?: string;
            source?: string;
            location?: string;
            dateRange?: string;
            append?: boolean;
            force?: boolean;
        }): Promise<void> {
            const query = params?.query ?? '';
            const source = params?.source ?? 'all';
            const location = params?.location ?? 'all';
            const dateRange = params?.dateRange ?? 'all';
            const append = params?.append ?? false;
            const force = params?.force ?? false;

            // Cache check: Return immediately if matching data is already cached
            if (
                !force &&
                !append &&
                store.publicJobsLoaded() &&
                store.publicJobs().length > 0 &&
                store.publicJobsQuery() === query &&
                store.publicJobsSource() === source &&
                store.publicJobsLocation() === location &&
                store.publicJobsDateRange() === dateRange
            ) {
                return;
            }

            const page = append ? store.publicJobsPage() + 1 : 1;
            const limit = append ? 50 : 30;

            if (append) {
                patchState(store, { publicJobsAppending: true });
            } else {
                patchState(store, { publicJobsLoading: true });
            }

            let publishDateParam = 'all';
            if (dateRange !== 'all') {
                const targetDate = new Date();
                if (dateRange === 'yesterday') {
                    targetDate.setDate(targetDate.getDate() - 1);
                } else if (dateRange === '3days') {
                    targetDate.setDate(targetDate.getDate() - 3);
                } else if (dateRange === '7days') {
                    targetDate.setDate(targetDate.getDate() - 7);
                } else if (dateRange === '30days') {
                    targetDate.setDate(targetDate.getDate() - 30);
                }
                const year = targetDate.getFullYear();
                const month = String(targetDate.getMonth() + 1).padStart(2, '0');
                const day = String(targetDate.getDate()).padStart(2, '0');
                publishDateParam = `${year}-${month}-${day}`;
            }

            try {
                const res: any = await firstValueFrom(
                    jobsService.getJobs(query, page, source, location, '', publishDateParam, limit)
                );

                const mapped: VacancyItem[] = (res.jobs || []).map((job: any) => ({
                    id: job.id,
                    vacancy: job.vacancy,
                    company: job.company,
                    location: job.location || 'Remote',
                    source: detectJobSource(job.source || '', job.link || '', job.company),
                    salaryRange: extractSalary(job),
                    publishDate: formatJobDate(job.publishDate),
                    deadline: job.deadline ? formatJobDate(job.deadline) : '',
                    matchScore: job.match || Math.floor(Math.random() * 10) + 90,
                    link: job.link || '/jobs'
                }));

                const total = res.counts?.filteredRecords || 0;
                const dbTotal = res.counts?.totalRecords || 0;
                const jobsGe = res.counts?.jobsGe ?? res.counts?.jobs_ge ?? res.counts?.['jobs.ge'] ?? 0;
                const hrGe = res.counts?.hrGe ?? res.counts?.hr_ge ?? res.counts?.['hr.ge'] ?? 0;

                let aworkGe = res.counts?.aworkGe ?? res.counts?.awork ?? res.counts?.['awork.ge'] ?? res.counts?.awork_ge ?? res.counts?.aWork ?? res.counts?.aWorkGe;
                if (aworkGe === undefined || (aworkGe === 0 && mapped.some(j => j.source === 'awork.ge'))) {
                    aworkGe = mapped.filter(j => j.source === 'awork.ge').length;
                }

                let myjobsGe = res.counts?.myjobsGe ?? res.counts?.myjobs_ge ?? res.counts?.['myjobs.ge'] ?? res.counts?.myjobs ?? res.counts?.myJobsGe ?? res.counts?.myJobs;
                if (myjobsGe === undefined || (myjobsGe === 0 && mapped.some(j => j.source === 'myjobs.ge'))) {
                    myjobsGe = mapped.filter(j => j.source === 'myjobs.ge').length;
                }

                const updatedJobs = append ? [...store.publicJobs(), ...mapped] : mapped;

                patchState(store, {
                    publicJobs: updatedJobs,
                    publicJobsTotal: total,
                    publicDbTotal: dbTotal,
                    publicJobsGeCount: jobsGe,
                    publicHrGeCount: hrGe,
                    publicAworkGeCount: aworkGe,
                    publicMyjobsGeCount: myjobsGe,
                    publicJobsPage: page,
                    publicHasMore: updatedJobs.length < total && mapped.length > 0,
                    publicJobsLoaded: true,
                    publicJobsLoading: false,
                    publicJobsAppending: false,
                    publicJobsQuery: query,
                    publicJobsSource: source,
                    publicJobsLocation: location,
                    publicJobsDateRange: dateRange,
                });
            } catch (err) {
                patchState(store, {
                    publicJobsLoading: false,
                    publicJobsAppending: false
                });
                console.error('Error loading public jobs:', err);
                throw err;
            }
        },

        async loadStats(force: boolean = false): Promise<void> {
            if (!force && store.statsLoaded() && store.stats() !== null) {
                return;
            }
            if (!force && inFlightStatsPromise) {
                return inFlightStatsPromise;
            }

            patchState(store, { statsLoading: true });

            inFlightStatsPromise = (async () => {
                try {
                    const res = await firstValueFrom(jobsService.getStats());
                    patchState(store, {
                        stats: res,
                        statsLoaded: true,
                        statsLoading: false,
                        publicDbTotal: res?.activeVacancies || store.publicDbTotal(),
                    });
                } catch (err) {
                    patchState(store, { statsLoading: false });
                    console.error('Error loading system stats:', err);
                } finally {
                    inFlightStatsPromise = null;
                }
            })();

            return inFlightStatsPromise;
        },

        async loadPublicCounts(force: boolean = false): Promise<void> {
            return this.loadStats(force);
        }
    })),
    withHooks({
        onInit(store) {
            store.loadStats();
            store.loadPublicJobs();
            store.loadCities();
        }
    })
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
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
import { PUBLIC_CV_STORAGE_KEY } from '../Core/Utils/public-cv-storage';

export const JOBUP_SOURCE = 'jobup.ge';
export const JOBUP_LOGO = '/favicon/favicon-96x96.png';
const PUBLIC_JOBS_PAGE_SIZE = 30;

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
    if (l.includes('linkedin') || l.includes('linkedinge')) return 'linkedin';
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
    /** HTTP status of the failed job request (404 = job doesn't exist, 0 = network/timeout). */
    selectedJobErrorStatus: number | null;

    publicJobs: VacancyItem[];
    publicJobsTotal: number;
    publicDbTotal: number;
    publicJobsGeCount: number;
    publicHrGeCount: number;
    publicAworkGeCount: number;
    publicMyjobsGeCount: number;
    publicLinkedinCount: number;
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
    selectedJobErrorStatus: null,

    publicJobs: [],
    publicJobsTotal: 0,
    publicDbTotal: 0,
    publicJobsGeCount: 0,
    publicHrGeCount: 0,
    publicAworkGeCount: 0,
    publicMyjobsGeCount: 0,
    publicLinkedinCount: 0,
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
// Keyed by store instance: on the server every request gets its own store, and a
// module-level variable would let concurrent renders share one request.
const inFlightPublicJobs = new WeakMap<object, { key: string; promise: Promise<void> }>();
// Id of the newest public-jobs filter request per store. A response whose id is no
// longer the newest is discarded, so a slow older request can't overwrite newer results.
const latestPublicJobsRequest = new WeakMap<object, number>();
// Abort handles of the public-jobs HTTP requests still running per store. A new filter
// request aborts them (like switchMap), so typing doesn't leave a trail of open requests.
const activePublicJobsRequests = new WeakMap<object, Set<() => void>>();
// First-page responses of recent filter combinations, so backspacing to an earlier search
// or toggling a filter back is served without another API call.
const PUBLIC_JOBS_CACHE_TTL_MS = 60_000;
const PUBLIC_JOBS_CACHE_MAX = 20;
const publicJobsResponseCache = new WeakMap<object, Map<string, { res: any; at: number }>>();
// Vacancies already opened and the "similar jobs" list per query, so going back to a
// vacancy page shows it right away instead of loading it again. Per store, like above.
const JOB_DETAILS_CACHE_MAX = 50;
const jobDetailsCache = new WeakMap<object, Map<string, Job>>();
const similarJobsCache = new WeakMap<object, Map<string, Job[]>>();

function storeCache<T>(caches: WeakMap<object, Map<string, T>>, store: object): Map<string, T> {
    let cache = caches.get(store);
    if (!cache) {
        cache = new Map();
        caches.set(store, cache);
    }
    return cache;
}

/** Adds to a cache, dropping the oldest entry once it holds `max`. */
function remember<T>(cache: Map<string, T>, key: string, value: T, max = JOB_DETAILS_CACHE_MAX) {
    cache.delete(key);
    cache.set(key, value);
    if (cache.size > max) cache.delete(cache.keys().next().value!);
}

/**
 * Reads the per-portal counts from a /job/all response. `mapped` is the page of
 * jobs that came with it, used as a fallback when the API omits a count.
 */
function extractPortalCounts(counts: any, mapped: VacancyItem[]) {
    const countSource = (source: string) => mapped.filter(j => j.source === source).length;

    const jobsGe = counts?.jobsGe ?? counts?.jobs_ge ?? counts?.['jobs.ge'] ?? 0;
    const hrGe = counts?.hrGe ?? counts?.hr_ge ?? counts?.['hr.ge'] ?? 0;

    let aworkGe = counts?.aworkGe ?? counts?.awork ?? counts?.['awork.ge'] ?? counts?.awork_ge ?? counts?.aWork ?? counts?.aWorkGe;
    if (aworkGe === undefined || (aworkGe === 0 && mapped.some(j => j.source === 'awork.ge'))) {
        aworkGe = countSource('awork.ge');
    }

    let myjobsGe = counts?.myjobsGe ?? counts?.myjobs_ge ?? counts?.['myjobs.ge'] ?? counts?.myjobs ?? counts?.myJobsGe ?? counts?.myJobs;
    if (myjobsGe === undefined || (myjobsGe === 0 && mapped.some(j => j.source === 'myjobs.ge'))) {
        myjobsGe = countSource('myjobs.ge');
    }

    let linkedin = counts?.linkedin ?? counts?.linkedIn ?? counts?.linkedinCom ?? counts?.['linkedin.com'];
    if (linkedin === undefined || (linkedin === 0 && mapped.some(j => j.source === 'linkedin'))) {
        linkedin = countSource('linkedin');
    }

    return {
        publicDbTotal: counts?.totalRecords || 0,
        publicJobsGeCount: jobsGe,
        publicHrGeCount: hrGe,
        publicAworkGeCount: aworkGe,
        publicMyjobsGeCount: myjobsGe,
        publicLinkedinCount: linkedin ?? 0,
    };
}

/**
 * Attaches a CV uploaded before signing in to the account (the API matches this browser's search
 * token, or the verified account email). Resolves true when a CV was attached.
 */
async function claimPublicCv(cvService: Cv): Promise<boolean> {
    let token: string | undefined;
    try {
        token = JSON.parse(localStorage.getItem(PUBLIC_CV_STORAGE_KEY) || 'null')?.searchToken;
    } catch {}
    try {
        const { claimed } = await firstValueFrom(cvService.claimPublicCv(token));
        if (claimed) {
            // The CV now lives on the account; the anonymous copy of it is gone.
            try {
                localStorage.removeItem(PUBLIC_CV_STORAGE_KEY);
            } catch {}
        }
        return claimed;
    } catch {
        return false;
    }
}

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

        // Profile completion = the alerts setup's steps: account (done once signed in), CV, channel.
        const hasCvStep = computed(() => !!store.userCv());
        /** A channel alerts can go to: Telegram, or a verified email on PRO. */
        const hasChannelStep = computed(() => {
            const p = store.profile();
            return !!p?.telegramChatId || (isPro() && !!p?.isEmailVerified);
        });
        const profilePercentage = computed(() =>
            Math.round(((1 + Number(hasCvStep()) + Number(hasChannelStep())) / 3) * 100));
        /** Everything alerts need: a CV and a connected channel. */
        const alertsReady = computed(() => hasCvStep() && hasChannelStep());

        return {
            plan,
            isPro,
            isBasic,
            hasActiveSubscription,
            hasCvStep,
            hasChannelStep,
            profilePercentage,
            alertsReady,
        };
    }),
    withMethods((store, authService = inject(AuthService), jobsService = inject(JobsService), userService = inject(Users), aiService = inject(Ai), cvService = inject(Cv), subscriptionService = inject(SubscriptionService)) => ({
        async loadProfile(force: boolean = false, silent: boolean = false): Promise<void> {
            if (!force && store.profileLoaded() && store.profile().id !== 0) {
                return;
            }
            if (!force && inFlightProfilePromise) {
                return inFlightProfilePromise;
            }

            inFlightProfilePromise = (async () => {
                try {
                    const profile = await authService.getUserProfile(silent);
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
                    const res = await firstValueFrom(cvService.getCV()).catch(async (err) => {
                        // No account CV yet: take over the CV this person uploaded before signing in.
                        if (err?.status !== 404 || !(await claimPublicCv(cvService))) throw err;
                        return firstValueFrom(cvService.getCV());
                    });
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

        /** Resolves true once the CV is saved (callers that don't care can ignore the result). */
        uploadCv(file: File, consent: boolean = true): Promise<boolean> {
            patchState(store, { cvLoading: true });
            return new Promise((resolve) => {
                cvService.upload(file, consent).subscribe({
                    next: (res) => {
                        patchState(store, { userCv: res, cvLoading: false, cvLoaded: true });
                        cvService.getCV().subscribe({
                            next: (fullCv) => {
                                patchState(store, { userCv: fullCv, searchQuery: fullCv?.summary?.searchQueries ?? [] });
                            }
                        });
                        resolve(true);
                    },
                    error: (err) => {
                        patchState(store, { cvLoading: false });
                        console.error('Error uploading CV:', err);
                        resolve(false);
                    }
                });
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
            const jobs = storeCache(jobDetailsCache, store);
            const cached = jobs.get(String(id));
            if (cached) {
                patchState(store, { selectedJob: cached, selectedJobLoading: false, selectedJobError: null, selectedJobErrorStatus: null });
                return;
            }
            patchState(store, { selectedJobLoading: true, selectedJobError: null, selectedJobErrorStatus: null });
            jobsService.getJobById(id).subscribe({
                next: (res: any) => {
                    const loadedJob = res?.job || res;
                    if (loadedJob && (loadedJob.id || loadedJob.vacancy)) {
                        remember(jobs, String(id), loadedJob);
                        patchState(store, { selectedJob: loadedJob, selectedJobLoading: false, selectedJobError: null });
                    } else {
                        patchState(store, { selectedJob: null, selectedJobLoading: false, selectedJobError: 'ვაკანსიის მონაცემები ვერ მოიძებნა', selectedJobErrorStatus: 404 });
                    }
                },
                error: (err: any) => {
                    console.error('Error loading job by ID:', err);
                    patchState(store, { selectedJob: null, selectedJobLoading: false, selectedJobError: 'ვაკანსიის ჩატვირთვისას დაფიქსირდა შეცდომა ან ვაკანსია ვერ მოიძებნა', selectedJobErrorStatus: err?.status ?? 0 });
                }
            });
        },

        /** Jobs matching a vacancy's title, for its "similar jobs" block. Cached per query. */
        async loadSimilarJobs(query: string): Promise<Job[]> {
            const cache = storeCache(similarJobsCache, store);
            const key = query.trim().toLowerCase();
            const cached = cache.get(key);
            if (cached) return cached;
            const res = await firstValueFrom(jobsService.getJobs(query, 1, 'all', 'all', '', 'all', 6));
            const jobs: Job[] = res?.jobs || [];
            remember(cache, key, jobs);
            return jobs;
        },

        clearSelectedJob() {
            patchState(store, { selectedJob: null, selectedJobLoading: false, selectedJobError: null, selectedJobErrorStatus: null });
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

            // Reuse a request that is already running for the same filters, so callers
            // never fire it twice. Only the newest filter request is kept here.
            const key = [query, source, location, dateRange].join('|');
            const running = inFlightPublicJobs.get(store);
            if (!append && !force && running?.key === key) {
                return running.promise;
            }

            // A new filter request supersedes everything before it; "load more" keeps the
            // current id, so it is discarded too if the filters change while it runs.
            const requestId = (latestPublicJobsRequest.get(store) ?? 0) + (append ? 0 : 1);
            latestPublicJobsRequest.set(store, requestId);
            const isStale = () => latestPublicJobsRequest.get(store) !== requestId;

            let active = activePublicJobsRequests.get(store);
            if (!active) {
                active = new Set();
                activePublicJobsRequests.set(store, active);
            }
            if (!append) {
                // Everything still running belongs to older filters: abort it.
                active.forEach(abort => abort());
                active.clear();
            }

            let cache = publicJobsResponseCache.get(store);
            if (!cache) {
                cache = new Map();
                publicJobsResponseCache.set(store, cache);
            }
            // force means the results changed (e.g. login), so nothing cached is trustworthy.
            if (force) cache.clear();

            const run = async (): Promise<void> => {
                const page = append ? store.publicJobsPage() + 1 : 1;
                // Must be the same for every page: the API skips (page - 1) * limit.
                const limit = PUBLIC_JOBS_PAGE_SIZE;

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
                    const cached = !append ? cache.get(key) : undefined;
                    let res: any;
                    if (cached && Date.now() - cached.at < PUBLIC_JOBS_CACHE_TTL_MS) {
                        res = cached.res;
                    } else {
                        let abort!: () => void;
                        res = await new Promise((resolve, reject) => {
                            // Unsubscribing aborts the underlying fetch.
                            const sub = jobsService
                                .getJobs(query, page, source, location, '', publishDateParam, limit)
                                .subscribe({ next: resolve, error: reject });
                            abort = () => {
                                sub.unsubscribe();
                                reject(new Error('Superseded by a newer search'));
                            };
                            active.add(abort);
                        }).finally(() => active.delete(abort));

                        if (!append) {
                            cache.delete(key);
                            cache.set(key, { res, at: Date.now() });
                            // Map keeps insertion order, so the first key is the oldest.
                            if (cache.size > PUBLIC_JOBS_CACHE_MAX) cache.delete(cache.keys().next().value!);
                        }
                    }

                    if (isStale()) {
                        // The newer request owns publicJobsLoading; only a dropped
                        // "load more" has a flag of its own to reset.
                        if (append) patchState(store, { publicJobsAppending: false });
                        return;
                    }

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
                    const updatedJobs = append ? [...store.publicJobs(), ...mapped] : mapped;

                    patchState(store, {
                        ...extractPortalCounts(res.counts, mapped),
                        publicJobs: updatedJobs,
                        publicJobsTotal: total,
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
                    if (isStale()) {
                        if (append) patchState(store, { publicJobsAppending: false });
                        return;
                    }
                    patchState(store, {
                        publicJobsLoading: false,
                        publicJobsAppending: false
                    });
                    console.error('Error loading public jobs:', err);
                    throw err;
                }
            };

            if (append) {
                return run();
            }
            const promise = run().finally(() => {
                if (inFlightPublicJobs.get(store)?.promise === promise) {
                    inFlightPublicJobs.delete(store);
                }
            });
            inFlightPublicJobs.set(store, { key, promise });
            return promise;
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
                    const portals = res?.portalCounts;
                    patchState(store, {
                        stats: res,
                        statsLoaded: true,
                        statsLoading: false,
                        publicDbTotal: res?.activeVacancies || store.publicDbTotal(),
                        ...(portals ? {
                            publicJobsGeCount: portals.jobsGe,
                            publicHrGeCount: portals.hrGe,
                            publicAworkGeCount: portals.aworkGe,
                            publicMyjobsGeCount: portals.myjobsGe,
                            publicLinkedinCount: portals.linkedin,
                        } : {}),
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
            // The public job list is loaded by the /vacancies page itself. Loading it here
            // made every server render (landing, vacancy, home pages) wait on it.
            store.loadStats();
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
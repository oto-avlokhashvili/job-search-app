import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { effect, inject, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HrService } from '../Core/Services/hr';
import { AuthService } from '../Core/Services/auth-service';
import { HrAccount, HrCandidate, HrUsage, LinkedinProfile, SeniorityLevel } from '../Core/Interfaces/hr';

export type HrSearchTab = 'cvs' | 'linkedin';
export interface HrSearchQuery {
    keyword: string;
    location: string;
    seniority: SeniorityLevel | '';
}

const CV_PAGE_SIZE = 20;
const LINKEDIN_MAX_PAGE = 10;

interface HrState {
    // Search page: what was typed, the active tab and both result lists survive leaving the page.
    searchForm: HrSearchQuery;
    searchTab: HrSearchTab;
    /** The query the current results belong to; each tab searches it lazily on first view. */
    searchQuery: HrSearchQuery | null;

    cvs: HrCandidate[];
    cvTotal: number;
    cvPage: number;
    cvLoading: boolean;
    cvSearched: boolean;
    cvError: string;

    profiles: LinkedinProfile[];
    linkedinPage: number;
    linkedinHasMore: boolean;
    linkedinLoading: boolean;
    linkedinSearched: boolean;
    linkedinError: string;

    // Candidates whose contacts this HR has opened, newest first.
    unlocked: HrCandidate[];
    unlockedLoaded: boolean;
    unlockedLoading: boolean;
    unlockedError: string;

    // Admin: HR accounts to approve.
    accounts: HrAccount[];
    accountsLoaded: boolean;
    accountsLoading: boolean;

    // Quota shown in the sidebar; refreshed after anything that spends it.
    usage: HrUsage | null;
}

const initialState: HrState = {
    searchForm: { keyword: '', location: 'Tbilisi', seniority: '' },
    searchTab: 'cvs',
    searchQuery: null,

    cvs: [],
    cvTotal: 0,
    cvPage: 1,
    cvLoading: false,
    cvSearched: false,
    cvError: '',

    profiles: [],
    linkedinPage: 1,
    linkedinHasMore: false,
    linkedinLoading: false,
    linkedinSearched: false,
    linkedinError: '',

    unlocked: [],
    unlockedLoaded: false,
    unlockedLoading: false,
    unlockedError: '',

    accounts: [],
    accountsLoaded: false,
    accountsLoading: false,

    usage: null,
};

/**
 * HR area data, kept across route changes so switching between search, candidates and
 * admin doesn't refetch. Cleared on logout so the next account starts empty.
 */
export const HrStore = signalStore(
    { providedIn: 'root' },
    withState(initialState),
    withMethods((store, hrService = inject(HrService)) => {
        const methods = {
            saveSearchForm(form: HrSearchQuery) {
                patchState(store, { searchForm: form });
            },

            /**
             * New query from the form: results of both tabs are stale, the active one reloads.
             * Requests still running for the old query are ignored when they land.
             */
            search(query: HrSearchQuery) {
                patchState(store, {
                    searchForm: query,
                    searchQuery: query,
                    cvSearched: false,
                    cvLoading: false,
                    cvError: '',
                    linkedinSearched: false,
                    linkedinLoading: false,
                    linkedinError: '',
                });
                methods.runActiveTab();
            },

            selectTab(tab: HrSearchTab) {
                patchState(store, { searchTab: tab });
                methods.runActiveTab();
            },

            runActiveTab() {
                if (!store.searchQuery()) return;
                if (store.searchTab() === 'cvs' && !store.cvSearched() && !store.cvLoading()) methods.searchCvs(1);
                if (store.searchTab() === 'linkedin' && !store.linkedinSearched() && !store.linkedinLoading()) {
                    methods.searchLinkedin(1);
                }
            },

            async searchCvs(page: number) {
                const q = store.searchQuery();
                if (!q) return;
                patchState(store, { cvLoading: true, cvError: '' });
                try {
                    const res = await firstValueFrom(hrService.searchCvs({ ...q, page, limit: CV_PAGE_SIZE }));
                    // A newer search replaced the query while this one ran: drop the stale results.
                    if (store.searchQuery() !== q) return;
                    patchState(store, {
                        cvs: page === 1 ? res.candidates : [...store.cvs(), ...res.candidates],
                        cvTotal: res.total,
                        cvPage: page,
                        cvSearched: true,
                    });
                } catch (err) {
                    if (store.searchQuery() === q) {
                        patchState(store, { cvError: hrService.errorMessage(err, 'ძიება ვერ მოხერხდა, სცადეთ თავიდან') });
                    }
                } finally {
                    if (store.searchQuery() === q) patchState(store, { cvLoading: false });
                }
            },

            async searchLinkedin(page: number) {
                const q = store.searchQuery();
                if (!q) return;
                patchState(store, { linkedinLoading: true, linkedinError: '' });
                try {
                    const res = await firstValueFrom(
                        hrService.searchLinkedin({ keyword: q.keyword, location: q.location, page }),
                    );
                    if (store.searchQuery() !== q) return;
                    patchState(store, {
                        profiles: page === 1 ? res.profiles : [...store.profiles(), ...res.profiles],
                        linkedinPage: page,
                        linkedinHasMore: res.count > 0 && page < LINKEDIN_MAX_PAGE,
                        linkedinSearched: true,
                    });
                } catch (err) {
                    if (store.searchQuery() === q) {
                        patchState(store, {
                            linkedinError: hrService.errorMessage(err, 'LinkedIn ძიება დროებით მიუწვდომელია, სცადეთ რამდენიმე წუთში'),
                        });
                    }
                } finally {
                    if (store.searchQuery() === q) patchState(store, { linkedinLoading: false });
                    methods.loadUsage(true);
                }
            },

            /** Opens a CV's contacts. Throws so the page can show the server's message. */
            async unlock(candidate: HrCandidate) {
                const unlocked = await firstValueFrom(hrService.unlock(candidate.id));
                // Keep the search-specific fields (match, matchedKeywords) from the original card.
                const merged = { ...candidate, ...unlocked };
                patchState(store, {
                    cvs: store.cvs().map((c) => (c.id === unlocked.id ? merged : c)),
                    // "My candidates" is newest first; add it there too instead of refetching.
                    unlocked: store.unlockedLoaded()
                        ? [merged, ...store.unlocked().filter((c) => c.id !== unlocked.id)]
                        : store.unlocked(),
                });
                methods.loadUsage(true);
            },

            async loadUnlocked(force = false) {
                if (store.unlockedLoading() || (!force && store.unlockedLoaded())) return;
                patchState(store, { unlockedLoading: true, unlockedError: '' });
                try {
                    patchState(store, { unlocked: await firstValueFrom(hrService.listUnlocked()), unlockedLoaded: true });
                } catch (err) {
                    patchState(store, { unlockedError: hrService.errorMessage(err, 'კანდიდატების ჩატვირთვა ვერ მოხერხდა') });
                } finally {
                    patchState(store, { unlockedLoading: false });
                }
            },

            /** Throws on failure so the admin page can show its own message. */
            async loadAccounts(force = false) {
                if (store.accountsLoading() || (!force && store.accountsLoaded())) return;
                patchState(store, { accountsLoading: true });
                try {
                    patchState(store, { accounts: await firstValueFrom(hrService.listHrAccounts()), accountsLoaded: true });
                } finally {
                    patchState(store, { accountsLoading: false });
                }
            },

            async setApproval(account: HrAccount, approved: boolean) {
                const updated = await firstValueFrom(hrService.setHrApproval(account.id, approved));
                patchState(store, {
                    accounts: store.accounts().map((a) => (a.id === updated.id ? { ...a, ...updated } : a)),
                });
            },

            async loadUsage(force = false) {
                if (!force && store.usage()) return;
                try {
                    patchState(store, { usage: await firstValueFrom(hrService.getUsage()) });
                } catch {
                    // The sidebar just keeps the last known numbers.
                }
            },

            reset() {
                patchState(store, initialState);
            },
        };
        return methods;
    }),
    withHooks({
        onInit(store, authService = inject(AuthService)) {
            // Another account may sign in next: drop everything on logout.
            effect(() => {
                if (!authService.isLoggedIn()) untracked(() => store.reset());
            });
        },
    }),
);

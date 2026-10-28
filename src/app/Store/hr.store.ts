import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { effect, inject, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HrService } from '../Core/Services/hr';
import { AuthService } from '../Core/Services/auth-service';
import {
    BoardCard,
    HrAccount,
    HrCandidate,
    HrUsage,
    HrVacancy,
    HrInterview,
    InterviewDraft,
    LinkedinProfile,
    PipelineChange,
    SeniorityLevel,
    VacancyMembership,
} from '../Core/Interfaces/hr';
import { applyChange } from '../Core/Utils/pipeline';

export type HrSearchTab = 'cvs' | 'linkedin';
export interface HrSearchQuery {
    keyword: string;
    location: string;
    seniority: SeniorityLevel | '';
}

const CV_PAGE_SIZE = 20;
const sortInterviews = (list: HrInterview[]) => [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
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

    /** Vacancy to add candidates to from the search page ("search for this vacancy"). */
    searchVacancyId: number | null;

    // Every board card of this HR, newest first: one per CV per vacancy, or one without a vacancy.
    // The main board shows them all; a vacancy board filters by vacancyId.
    board: BoardCard[];
    boardLoaded: boolean;
    boardLoading: boolean;
    boardError: string;

    vacancies: HrVacancy[];
    vacanciesLoaded: boolean;
    vacanciesLoading: boolean;

    // Interviews from the last month on, soonest first; cards show their latest one
    interviews: HrInterview[];
    interviewsLoaded: boolean;
    interviewsLoading: boolean;

    // Admin: HR accounts to approve.
    accounts: HrAccount[];
    accountsLoaded: boolean;
    accountsLoading: boolean;

    // Quota shown in the sidebar; refreshed after anything that spends it.
    usage: HrUsage | null;
    usageLoading: boolean;
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

    searchVacancyId: null,

    board: [],
    boardLoaded: false,
    boardLoading: false,
    boardError: '',

    vacancies: [],
    vacanciesLoaded: false,
    vacanciesLoading: false,

    interviews: [],
    interviewsLoaded: false,
    interviewsLoading: false,

    accounts: [],
    accountsLoaded: false,
    accountsLoading: false,

    usage: null,
    usageLoading: false,
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

            /** Opens a CV's contacts without adding it to a vacancy. Throws so the page can show the server's message. */
            async unlock(candidate: HrCandidate) {
                const unlocked = await firstValueFrom(hrService.unlock(candidate.id));
                // Keep the search-specific fields (match, matchedKeywords) from the original card.
                patchState(store, { cvs: store.cvs().map((c) => (c.id === unlocked.id ? { ...c, ...unlocked } : c)) });
                // The server put it on the main board without a vacancy; pick that card up.
                if (store.boardLoaded()) methods.loadBoard(true);
                methods.loadUsage(true);
            },

            /** Adds a CV to a vacancy, opening its contacts first if needed. Throws on failure. */
            async addToVacancy(candidate: HrCandidate, vacancyId: number) {
                const card = await firstValueFrom(hrService.addToVacancy(vacancyId, candidate.id));
                if (store.boardLoaded()) {
                    // A card without a vacancy moves into the vacancy (same id); otherwise it's a new card.
                    patchState(store, { board: [card, ...store.board().filter((c) => c.pipeline.id !== card.pipeline.id)] });
                }
                const now = new Date().toISOString();
                patchState(store, {
                    cvs: store.cvs().map((c) => {
                        if (c.id !== card.id) return c;
                        const { pipeline, ...fields } = card;
                        return { ...c, ...fields };
                    }),
                    // Recently used vacancies are listed first
                    vacancies: store.vacancies().map((v) => (v.id === vacancyId ? { ...v, updatedAt: now } : v)),
                });
                methods.loadUsage(true);
                return card;
            },

            /**
             * Board change, shown at once and rolled back if the server refuses.
             * `order` = the card's column after a drop (entry ids, top to bottom). Throws on failure.
             */
            async updatePipeline(entryId: number, change: PipelineChange, order?: number[]) {
                const before = store.board();
                const positions = new Map(order?.map((id, i) => [id, i]));
                patchState(store, {
                    board: before.map((c) => {
                        const id = c.pipeline.id;
                        const position = positions.get(id);
                        if (id !== entryId && position === undefined) return c;
                        const pipeline = id === entryId ? applyChange(c.pipeline, change) : c.pipeline;
                        return { ...c, pipeline: position === undefined ? pipeline : { ...pipeline, position } };
                    }),
                });
                methods.syncSearchMemberships();
                try {
                    const saved = await firstValueFrom(hrService.updatePipeline(entryId, { ...change, order }));
                    patchState(store, {
                        board: store.board().map((c) => (c.pipeline.id === entryId ? { ...c, pipeline: saved } : c)),
                    });
                } catch (err) {
                    patchState(store, { board: before });
                    methods.syncSearchMemberships();
                    throw err;
                }
            },

            /** Takes a card off its vacancy; the CV's last card stays on the main board without one. Throws on failure. */
            async removeFromVacancy(card: BoardCard) {
                const kept = await firstValueFrom(hrService.removeFromVacancy(card.pipeline.id));
                patchState(store, {
                    board: kept
                        ? store.board().map((c) => (c.pipeline.id === kept.id ? { ...c, pipeline: kept } : c))
                        : store.board().filter((c) => c.pipeline.id !== card.pipeline.id),
                });
                methods.syncSearchMemberships();
            },

            async loadBoard(force = false) {
                if (store.boardLoading() || (!force && store.boardLoaded())) return;
                patchState(store, { boardLoading: true, boardError: '' });
                try {
                    patchState(store, { board: await firstValueFrom(hrService.getBoard()), boardLoaded: true });
                    methods.syncSearchMemberships();
                } catch (err) {
                    patchState(store, { boardError: hrService.errorMessage(err, 'კანდიდატების ჩატვირთვა ვერ მოხერხდა') });
                } finally {
                    patchState(store, { boardLoading: false });
                }
            },

            /** Search results show which vacancies a CV is in; keep that in step with the board. */
            syncSearchMemberships() {
                if (!store.boardLoaded() || !store.cvs().length) return;
                const byCv = new Map<number, VacancyMembership[]>();
                for (const c of store.board()) {
                    if (c.pipeline.vacancyId === null) continue;
                    const list = byCv.get(c.id) ?? [];
                    list.push({ entryId: c.pipeline.id, vacancyId: c.pipeline.vacancyId, stage: c.pipeline.stage });
                    byCv.set(c.id, list);
                }
                patchState(store, {
                    cvs: store.cvs().map((c) => (c.unlocked ? { ...c, vacancies: byCv.get(c.id) ?? [] } : c)),
                });
            },

            async loadVacancies(force = false) {
                if (store.vacanciesLoading() || (!force && store.vacanciesLoaded())) return;
                patchState(store, { vacanciesLoading: true });
                try {
                    const res = await firstValueFrom(hrService.listVacancies());
                    patchState(store, { vacancies: res.vacancies, vacanciesLoaded: true });
                } catch {
                    // The sidebar just shows no vacancies; the boards still work from the board cards.
                } finally {
                    patchState(store, { vacanciesLoading: false });
                }
            },

            /** Throws so the dialog can show the server's message (e.g. the open-vacancy limit). */
            async createVacancy(title: string) {
                const vacancy = await firstValueFrom(hrService.createVacancy(title));
                patchState(store, { vacancies: [vacancy, ...store.vacancies()] });
                return vacancy;
            },

            async updateVacancy(id: number, change: Partial<Pick<HrVacancy, 'title' | 'status'>>) {
                const saved = await firstValueFrom(hrService.updateVacancy(id, change));
                patchState(store, { vacancies: store.vacancies().map((v) => (v.id === id ? saved : v)) });
                return saved;
            },

            /** Its candidates stay unlocked; the server moves or drops their cards, so the board reloads. */
            async deleteVacancy(id: number) {
                await firstValueFrom(hrService.deleteVacancy(id));
                patchState(store, {
                    vacancies: store.vacancies().filter((v) => v.id !== id),
                    searchVacancyId: store.searchVacancyId() === id ? null : store.searchVacancyId(),
                });
                await methods.loadBoard(true);
            },

            async loadInterviews(force = false) {
                if (store.interviewsLoading() || (!force && store.interviewsLoaded())) return;
                patchState(store, { interviewsLoading: true });
                try {
                    patchState(store, { interviews: await firstValueFrom(hrService.listInterviews()), interviewsLoaded: true });
                } catch {
                    // Cards just show no interview info; the next visit retries
                } finally {
                    patchState(store, { interviewsLoading: false });
                }
            },

            /** Schedules an interview; the server also moves the card to INTERVIEW. Throws on failure. */
            async scheduleInterview(card: BoardCard, draft: InterviewDraft, send: boolean) {
                const { interview, pipeline } = await firstValueFrom(hrService.scheduleInterview(card.pipeline.id, { ...draft, send }));
                patchState(store, {
                    interviews: sortInterviews([...store.interviews().filter((i) => i.id !== interview.id), interview]),
                    board: store.board().map((c) => (c.pipeline.id === pipeline.id ? { ...c, pipeline } : c)),
                });
                methods.syncSearchMemberships();
                return interview;
            },

            /** Edit, accept a proposed time or cancel. Throws on failure. */
            async updateInterview(id: number, change: Parameters<HrService['updateInterview']>[1]) {
                const saved = await firstValueFrom(hrService.updateInterview(id, change));
                patchState(store, {
                    interviews: sortInterviews(
                        saved.status === 'CANCELLED'
                            ? store.interviews().filter((i) => i.id !== id)
                            : store.interviews().map((i) => (i.id === id ? saved : i)),
                    ),
                });
                return saved;
            },

            setSearchVacancy(id: number | null) {
                patchState(store, { searchVacancyId: id });
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
                // The guard starts this before the layout exists; don't fire a second request meanwhile.
                if (!force && (store.usage() || store.usageLoading())) return;
                patchState(store, { usageLoading: true });
                try {
                    patchState(store, { usage: await firstValueFrom(hrService.getUsage()) });
                } catch {
                    // The sidebar just keeps the last known numbers.
                } finally {
                    patchState(store, { usageLoading: false });
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
